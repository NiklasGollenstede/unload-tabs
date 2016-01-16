'use strict';

const { Cc,  Ci,  Cu, } = require("chrome");
const { viewFor } = require("sdk/view/core");
const Windows = require("sdk/windows").browserWindows;
const NameSpace = require('sdk/core/namespace').ns;
const Prefs = require("sdk/simple-prefs");

const gSessionStore = Cc["@mozilla.org/browser/sessionstore;1"].getService(Ci.nsISessionStore);
Cu.importGlobalProperties([ 'btoa', ]); /* global btoa */
const toBase64 = btoa;

function log() { console.log.apply(console, arguments); return arguments[arguments.length - 1]; }

let hidden; // NameSpace to add hidden values to xul elements

const CSS = 'href="data:text/css;base64,'+ toBase64(String.raw`
	@namespace url(http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul);
	#context_unloadTab {
		list-style-image: url(chrome://browser/skin/menuPanel-exit.png);
		-moz-image-region: rect(0px, 16px, 16px, 0px);
		-moz-binding:url(chrome://global/content/bindings/menu.xml#menuitem-iconic-noaccel) !important;
	}
	#context_unloadTab > hbox.menu-iconic-left {
		-moz-appearance: menuimage;
	}
	#context_unloadTab > hbox.menu-iconic-left[disabled] {
		opacity: .5;
	}

	.tabbrowser-tab[pending=true], menuitem.alltabs-item[pending=true] {
		${ decodeURIComponent(Prefs.prefs.tabStyle.replace(/[\{\}]/g, '')) }
	}
`) +'"';

/**
 * find closest tab tat is not pending, i.e. loaded
 * @param  {...<tab>} tabs     an iterable collection of xul <tab>'s to search in
 * @param  {<tab>}    current  the element in tabs that 'closest' is mesured from
 * @return {<tab>}             may be undefind in no non-pending tab was found
 */
function findClosestNonPending(tabs, current) {
	let index = Array.prototype.indexOf.call(tabs, current);

	let visibleTab; // closest not hidden tab
	let hiddenTab; // closest tab, may be hidden

	function isGood(tab) {
		return tab && !tab.getAttribute('pending') && (hiddenTab = hiddenTab || tab) && !tab.getAttribute('hidden') && (visibleTab = tab);
	}

	// search up and down at the same time, looking for a loaded tabs, stopping once a loaded and not hidden tab is found
	for (
		let j = index - 1, i = index + 1, length = tabs.length;
		(j >= 0 || i < length) && !(isGood(tabs[j]) || isGood(tabs[i]));
		--j, ++i
	) { }

	return visibleTab || hiddenTab;
}

/**
 * unloads the given tab by coning its sessionstore state into a new tab and then closing the old one
 * @param  {xul <tabbrowser>} gBrowser tab's tabbrowser
 * @param  {<tab>}            tab      the tab to unload
 */
function unloadTab(gBrowser, tab) {
	if (tab.getAttribute('pending')) { return; }

/// copied from bartablitex@szabolcs.hubai

	// clone tabs SessionStore state into a new tab
	let newtab = gBrowser.addTab(null, {skipAnimation: true});
	gSessionStore.setTabState(newtab, gSessionStore.getTabState(tab));

	// Move the new tab next to the one we're removing, but not in
	// front of it as that confuses Tree Style Tab.
	gBrowser.moveTabTo(newtab, tab._tPos + 1);

	// Restore tree when using Tree Style Tab
	if (gBrowser.treeStyleTab) {
		let parent = gBrowser.treeStyleTab.getParentTab(tab);
		if (parent) {
			gBrowser.treeStyleTab.attachTabTo(newtab, parent,
				{dontAnimate: true, insertBefore: tab.nextSibling});
		}
		let children = gBrowser.treeStyleTab.getChildTabs(tab);
		children.forEach(function(aChild) {
			gBrowser.treeStyleTab.attachTabTo(
				aChild, newtab, {dontAnimate: true});
		});
	}

/// end copy

	if (tab.selected) {
		// select an other tab, won't work if 'tab' is only tab
		gBrowser.selectedTab = findClosestNonPending(tab.parentNode.children, tab);
	}

/// copied from bartablitex@szabolcs.hubai

	// Close the original tab.  We're taking the long way round to
	// ensure the nsISessionStore service won't save this in the
	// recently closed tabs.
	if (gBrowser._beginRemoveTab(tab, true, null, false)) {
		gBrowser._endRemoveTab(tab);
	}

/// end copy
}

/**
 * initialises the addon for a window
 * called by high-levels Window.on('open', ...)
 * @param  {high-level window}   window    the window that just opened
 */
function windowOpened(window) {
	const { gBrowser } = viewFor(window);
	const { tabContainer } = gBrowser;
	// const confirm = gBrowser.contentWindow.confirm.bind(gBrowser.contentWindow);
	const { contextMenu } = tabContainer;
	const document = tabContainer.ownerDocument;

	const capture = { tab: null, };
	const onContext = event => {
		const menu = event.target;
		capture.tab = menu.contextTab || menu.triggerNode;

		let item = menu.children.context_unloadTab;

		if (!item) {
			item = menu.ownerDocument.createElement('menuitem');
			item.id = 'context_unloadTab';
			item.setAttribute('label', 'Unload Tab');
			menu.insertBefore(item, menu.children.context_reloadTab.nextSibling);
			item.addEventListener('click', click => {
				if (click.button) { return; }
				unloadTab(gBrowser, capture.tab);
			});
		}

		item[capture.tab.getAttribute('pending') ? 'setAttribute' : 'removeAttribute']('disabled', 'true');
	};

	const onClose = ({ target: tab }) => {
		if (!tab.selected) { return; }

		gBrowser.selectedTab = findClosestNonPending(tabContainer.children, gBrowser.selectedTab);
	};

	hidden(tabContainer).onClose = onClose;
	hidden(tabContainer).onContext = onContext;

	tabContainer.addEventListener('TabClose', onClose, false);
	contextMenu.addEventListener('popupshowing', onContext, false);

	hidden(tabContainer).styleElement = document.insertBefore(
		document.createProcessingInstruction('xml-stylesheet', CSS),
		document.firstChild
	);

	Prefs.prefs.debug && (gBrowser.unloadtab = exports);
}
/**
 * unloads the addon for a window
 * called by high-levels Window.on('close', ...)
 * @param  {high-level window}   window    the window that just closed / is about to close (?)
 */
function windowClosed(window) {
	const { gBrowser } = viewFor(window);
	const { tabContainer } = gBrowser;
	const { contextMenu } = tabContainer;

	{
		const item = contextMenu.querySelector('#context_unloadTab');
		item && item.remove();
	}

	const { onClose, onContext, styleElement } = hidden(tabContainer);
	tabContainer.removeEventListener('TabClose', onClose, false);
	contextMenu.removeEventListener('popupshowing', onContext, false);
	styleElement.remove();

	Prefs.prefs.debug && (gBrowser.unloadtab = null);
}

/**
 * addons main entry point
 */
function startup() {
	hidden = Prefs.prefs.debug ? o => o : NameSpace();
	Array.prototype.forEach.call(Windows, windowOpened);
	Windows.on('open', windowOpened);
	Windows.on('close', windowClosed);
}

/**
 * removes all listeners and reverts all changes
 */
function shutdown() {
	Windows.removeListener('close', windowClosed);
	Windows.removeListener('open', windowOpened);
	Array.prototype.forEach.call(Windows, windowClosed);
	hidden = null;
}

// make sdk run startup
exports.main = startup;

// respond to unload, unless its because of 'shutdown' (performance)
exports.onUnload = reason => {
	if (reason !== 'shutdown') {
		shutdown();
	}
};

// expose all components for debugging, if debugging is activated
if (Prefs.prefs.debug) {
	exports.require = require;
	exports.gSessionStore = gSessionStore;
	exports.hidden = hidden;
	exports.findClosestNonPending = findClosestNonPending;
	exports.unloadTab = unloadTab;
	exports.windowOpened = windowOpened;
	exports.windowClosed = windowClosed;
	exports.startup = startup;
	exports.shutdown = shutdown;
}
