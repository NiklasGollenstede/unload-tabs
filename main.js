'use strict';

const { Cc,  Ci,  Cu, } = require('chrome');
const { viewFor, } = require('sdk/view/core');
const Windows = require('sdk/windows').browserWindows;
const Tabs = require('sdk/tabs');
const NameSpace = require('sdk/core/namespace').ns;
const Prefs = require('sdk/simple-prefs');
const { Hotkey, } = require('sdk/hotkeys');

const gSessionStore = Cc["@mozilla.org/browser/sessionstore;1"].getService(Ci.nsISessionStore);
Cu.importGlobalProperties([ 'btoa', ]); /* global btoa */
const toBase64 = btoa;

function log() { console.log.apply(console, arguments); return arguments[arguments.length - 1]; }

let _private; // NameSpace to add private values to xul elements
const shortCuts = { };

const unloadedTabStyle = () => `
	.tabbrowser-tab[pending=true], menuitem.alltabs-item[pending=true] {
		${ Prefs.prefs.tabStyle.replace(/[\{\}]/g, '') }
	}`;

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

	${ unloadedTabStyle() }
`) +'"';

/**
 * Listen for CSS setting changes
 */
Prefs.on('tabStyle', () => {
	Array.forEach(Windows, window => {
		const style = _private(viewFor(window).gBrowser).styleElement;
		if (!style) { return; }
		style.sheet.deleteRule(style.sheet.cssRules.length - 1);
		style.sheet.insertRule(unloadedTabStyle(), style.sheet.cssRules.length);
	});
});

/**
 * find closest tab tat is not pending, i.e. loaded
 * @param  {[<tab>]}  tabs     an iterable collection of xul <tab>'s to search in
 * @param  {<tab>}    current  the element in tabs that 'closest' is mesured from
 * @return {<tab>}             may be undefind in no non-pending tab was found
 */
function findClosestNonPending(tabs, current) {
	let index = Array.indexOf(tabs, current);

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

function selectNextLoaded(backwards) {
	const current = viewFor(Tabs.activeTab);
	const tabs = current.parentNode.children;

	let index = Array.indexOf(tabs, current) + tabs.length, tab;
	do {
		index = index + (backwards ? -1 : 1);
		tab = tabs[index % tabs.length];
	} while (
		tab.getAttribute('pending') || tab.getAttribute('hidden')
	);

	current.ownerDocument.defaultView.gBrowser.selectedTab = tab;
}

/**
 * initialises the addon for a window
 * called by high-levels Window.on('open', ...)
 * @param  {high-level window}   window    the window that just opened
 */
function windowOpened(window) {
	const { gBrowser, document, } = viewFor(window);
	const { tabContainer, } = gBrowser;
	// const confirm = gBrowser.contentWindow.confirm.bind(gBrowser.contentWindow);
	const { contextMenu, } = tabContainer;

	// const capture = { tab: null, };
	let currentTab = null;
	const onContext = event => {
		const menu = event.target;
		currentTab = menu.contextTab || menu.triggerNode;

		let item = menu.children.context_unloadTab;

		if (!item) {
			_private(gBrowser).item = item = document.createElement('menuitem');
			item.id = 'context_unloadTab';
			item.class = 'menu-iconic';
			// item.image = 'chrome://browser/skin/menuPanel-exit.png';
			item.setAttribute('label', 'Unload Tab');
			menu.insertBefore(item, menu.children.context_reloadTab.nextSibling);
			item.addEventListener('command', event => unloadTab(gBrowser, currentTab));
		}

		item[currentTab.getAttribute('pending') ? 'setAttribute' : 'removeAttribute']('disabled', 'true');
	};

	const onClose = ({ target: tab, }) => {
		if (!tab.selected) { return; }
		gBrowser.selectedTab = findClosestNonPending(tabContainer.children, gBrowser.selectedTab);
	};

	_private(gBrowser).onClose = onClose;
	_private(gBrowser).onContext = onContext;

	tabContainer.addEventListener('TabClose', onClose, false);
	contextMenu.addEventListener('popupshowing', onContext, false);

	_private(gBrowser).styleElement = document.insertBefore(
		document.createProcessingInstruction('xml-stylesheet', CSS),
		document.firstChild
	);
}
/**
 * unloads the addon for a window
 * called by high-levels Window.on('close', ...)
 * @param  {high-level window}   window    the window that just closed / is about to close (?)
 */
function windowClosed(window) {
	const { gBrowser, } = viewFor(window);
	const { tabContainer, } = gBrowser;
	const { contextMenu, } = tabContainer;
	const { onClose, onContext, styleElement, item, } = _private(gBrowser);

	item && item.remove();
	tabContainer && tabContainer.removeEventListener('TabClose', onClose, false);
	contextMenu && contextMenu.removeEventListener('popupshowing', onContext, false);
	styleElement && styleElement.remove();
}

/**
 * addons main entry point
 */
function startup() {
	_private = new NameSpace();
	Array.forEach(Windows, windowOpened);
	Windows.on('open', windowOpened);
	Windows.on('close', windowClosed);
	Object.assign(shortCuts, { // TODO: add change listener for these hotkeys
		nextLoaded: Prefs.prefs.hotkeyNextLoaded && new Hotkey({
			combo: Prefs.prefs.hotkeyNextLoaded,
			onPress: selectNextLoaded.bind(null, false),
		}),
		prevLoaded: Prefs.prefs.hotkeyPrevLoaded && new Hotkey({
			combo: Prefs.prefs.hotkeyPrevLoaded,
			onPress: selectNextLoaded.bind(null, true),
		}),
	});
}

/**
 * removes all listeners and reverts all changes
 */
function shutdown() {
	Windows.removeListener('close', windowClosed);
	Windows.removeListener('open', windowOpened);
	Array.prototype.forEach.call(Windows, windowClosed);
	Object.keys(shortCuts).forEach(key => shortCuts[key].destroy() && delete shortCuts[key]);
	_private = null;
}

// make sdk run startup
exports.main = startup;

// respond to unload, unless its because of 'shutdown' (performance)
exports.onUnload = reason => {
	if (reason !== 'shutdown') {
		shutdown();
	}
};
