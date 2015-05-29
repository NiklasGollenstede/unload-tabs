'use strict';

const { Cc,  Ci,  Cu, } = require("chrome");
const { viewFor } = require("sdk/view/core");
const Windows = require("sdk/windows").browserWindows;
const NameSpace = require('sdk/core/namespace').ns;
const Prefs = require("sdk/simple-prefs");

const gSessionStore = Cc["@mozilla.org/browser/sessionstore;1"].getService(Ci.nsISessionStore);

let hidden; // NameSpace to add hidden values to xul elements

/**
 * find closest tab tat is not pending, i.e. loaded
 * @param  {...<tab>} tabs     an iterable collection of xul <tab>'s to search in
 * @param  {<tab>}    current  the element in tabs that 'closest' is mesured from
 * @return {<tab>}             may be undefind in no non-pending tab was found
 */
function findClosestNonPending(tabs, current) {
	let index = Array.prototype.indexOf.call(tabs, current);

	let tab;

	// loop up and down at the same time, looking for a loaded tab
	for (
		let j = index - 1, i = index- -1;
		j >= 0 || i < tabs.length;
		--j, ++i
	) {
		if (j >= 0 && tabs[j] && !tabs[j].getAttribute('pending')) {
			tab = tabs[j];
			break;
		}
		if (i < tabs.length && tabs[i] && !tabs[i].getAttribute('pending')) {
			tab = tabs[i];
			break;
		}
	}

	return tab;
}

/**
 * unloads the given tab by coning its sessionstore state into a new tab and then closing the old one
 * @param  {xul <tabbrowser>} gBrowser tab's tabbrowser
 * @param  {<tab>}            tab      the tab to unload
 */
function unloadTab(gBrowser, tab) {
	if (tab.getAttribute('pending')) { return; }

	if (tab.selected) {
		// select an other tab, won't work if 'tab' is only tab
		gBrowser.selectedTab = findClosestNonPending(tab.parentNode, tab);
	}

/// bluntly copied from bartablitex@szabolcs.hubai

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
	let { gBrowser } = viewFor(window);
	let { tabContainer } = gBrowser;
	// let confirm = gBrowser.contentWindow.confirm.bind(gBrowser.contentWindow);
	let { contextMenu } = tabContainer;
	let document = tabContainer.ownerDocument;

	let capture = { tab: null, };
	let onContext = event => {
		let menu = event.target;
		capture.tab = menu.contextTab || menu.triggerNode;

		let item = menu.children.context_unloadTab;

		if (!item) {
			let next = menu.children.context_reloadTab.nextSibling;
			item = menu.ownerDocument.createElement('menuitem');
			item.id = 'context_unloadTab';
			item.setAttribute('label', 'Unload Tab');
			menu.insertBefore(item, next);
			item.addEventListener('click', click => {
				if (click.button) { return; }
				unloadTab(gBrowser, capture.tab);
			});
		}

		item[capture.tab.getAttribute('pending') ? 'setAttribute' : 'removeAttribute']('disabled', 'true');
	};

	let onClose = ({ target: tab }) => {
		if (!tab.selected) { return; }

		gBrowser.selectedTab = findClosestNonPending(tabContainer.children, gBrowser.selectedTab);
	};

	hidden(tabContainer).onClose = onClose;
	hidden(tabContainer).onContext = onContext;

	tabContainer.addEventListener('TabClose', onClose, false);
	contextMenu.addEventListener('popupshowing', onContext, false);

	hidden(tabContainer).styleElement = document.insertBefore(document.createProcessingInstruction(
		'xml-stylesheet',
		'href="data:text/css,.tabbrowser-tab[pending=true], menuitem.alltabs-item[pending=true] {'+
			decodeURIComponent(Prefs.prefs.tabStyle.replace(/[\{\}]/g, ''))
		+'}"'
	), document.firstChild);

	Prefs.prefs.debug && (gBrowser.unloadtab = exports);
}

/**
 * unloads the addon for a window
 * called by high-levels Window.on('close', ...)
 * @param  {high-level window}   window    the window that just closed / is about to close (?)
 */
function windowClosed(window) {
	let { gBrowser } = viewFor(window);
	let { tabContainer } = gBrowser;
	let { contextMenu } = tabContainer;

	{
		let item = contextMenu.querySelector('#context_unloadTab');
		item && item.remove();
	}

	let { onClose, onContext, styleElement } = hidden(tabContainer);
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
