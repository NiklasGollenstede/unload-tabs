'use strict';

const { Cc,  Ci, Cu, } = require('chrome');
const { viewFor, } = require('sdk/view/core');
const Windows = require('sdk/windows').browserWindows;
const Tabs = require('sdk/tabs');
const NameSpace = require('sdk/core/namespace').ns;
const Prefs = require('sdk/simple-prefs');
const { Hotkey, } = require('sdk/hotkeys');
const baseUrl = require('sdk/self').data.url('../');

const gSessionStore = Cc["@mozilla.org/browser/sessionstore;1"].getService(Ci.nsISessionStore);
const { Services } = require('resource://gre/modules/Services.jsm');
const browserPrefs = Services.prefs.getBranch('browser.');
const getNewTabURL = Object.getOwnPropertyDescriptor(Cc['@mozilla.org/browser/aboutnewtab-service;1'].getService(Ci.nsIAboutNewTabService), 'newTabURL').get;
Cu.importGlobalProperties([ 'btoa', ]); /* global btoa */
const toBase64 = btoa;

function log() { console.log.apply(console, arguments); return arguments[arguments.length - 1]; }
const forEach = (_=>_).call.bind(Array.prototype.forEach);
const filter  = (_=>_).call.bind(Array.prototype.filter);
const indexOf = (_=>_).call.bind(Array.prototype.indexOf);

let _private; // NameSpace to add private values to xul elements
const addedMenuItens = new Set();
const shortCuts = { };

const unloadedTabStyle = () => (`
	.tabbrowser-tab[pending=true], menuitem.alltabs-item[pending=true] {
		`+ Prefs.prefs.tabStyle.replace(/[\{\}]/g, '') +`
	}
`);

const CSS = 'href="data:text/css;base64,'+ toBase64(`
	@namespace url(http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul);
	#context_unloadTab,
	#context_unloadOtherTabs
	{ -moz-binding: url(chrome://global/content/bindings/menu.xml#menuitem-iconic-noaccel) !important; }
	#context_unloadTab
	{
		list-style-image: url(chrome://browser/skin/menuPanel-exit@2x.png);
		-moz-image-region: rect(0px, 32px, 32px, 0px);
	}
	#context_unloadOtherTabs
	{
		list-style-image: url(${ baseUrl +'icon-others.png' });
		-moz-image-region: rect(0px, 32px, 32px, 0px);
	}
	#context_unloadTab       > hbox.menu-iconic-left,
	#context_unloadOtherTabs > hbox.menu-iconic-left
	{ -moz-appearance: menuimage; }
	#context_unloadTab       > hbox.menu-iconic-left[disabled],
	#context_unloadOtherTabs > hbox.menu-iconic-left[disabled]
	{ opacity: .5; }

	${ unloadedTabStyle() }
`) +'"';

/**
 * Listen for CSS setting changes
 */
Prefs.on('tabStyle', () => {
	forEach(Windows, window => {
		const style = _private(viewFor(window).gBrowser).styleElement;
		if (!style) { return; }
		style.sheet.deleteRule(style.sheet.cssRules.length - 1);
		style.sheet.insertRule(unloadedTabStyle(), style.sheet.cssRules.length);
	});
});

/**
 * Finds the closest not pending (i.e. loaded) tab in an array of tabs.
 * @param  {[<tab>]}   tabs     An array-like collection of xul <tab>'s to search in.
 * @param  {<tab>}     current  The element in tabs that 'closest' is measured from.
 * @param  {function}  .filter  Optional. If provided, a tab will only be accepted if it is accepted by this predicate.
 * @param  {<tab>}     .prefer  Optional. If provided and acceptable, this tab will be returned before checking the Array.
 * @return {<tab>}              `null` if no non-pending tab was found or if `current` is not in `tabs`.
 */
function findClosestNonPending(tabs, current, { filter = _=>true, } = { }) {
	let found = null; // closest loaded tab
	function find(tab) {
		return tab && !tab.getAttribute('pending') && filter(tab) && (found = tab);
	}

	switch (Prefs.prefs.onClose) {
		case 1: case '1': {
			if (find(current.nextSibling)) { return current.nextSibling; }
		} break;
		case 2: case '2': {
			if (find(current._lastOwner)) { return current._lastOwner; }
		} break;
		case 3: case '3': {
			if (find(current._lastOwner)) { return current._lastOwner; }
			if (find(current.nextSibling)) { return current.nextSibling; }
		} break;
	}

	const index = indexOf(tabs, current);
	if (index < 0) { return null; }

	// search up and down at the same time, looking for a loaded tabs, stopping once a loaded and not hidden tab is found
	for (
		let j = index - 1, i = index + 1, length = tabs.length;
		(j >= 0 || i < length) && !(find(tabs[j]) || find(tabs[i]));
		--j, ++i
	) { }

	return found;
}

/**
 * Unloads the given tab by cloning its SessionStore state into a new tab and then closing the old one.
 * @author  Significant portions of the code in this function originate from the add-on `bartablitex@szabolcs.hubai`.
 * @param  {<tabbrowser>}  gBrowser  The tab's tabbrowser.
 * @param  {<tab>}         tab       The tab to unload.
 */
function unloadTab(gBrowser, tab) {
	if (tab.getAttribute('pending')) { return; }
	const userContextId = tab.getAttribute('usercontextid') || '';

	if (tab.selected) {
		// select an other tab, open a default tab if none is found
		gBrowser.selectedTab = findClosestNonPending(gBrowser.visibleTabs, tab)
		|| gBrowser.addTab(getNewTabURL());
	}

	// clone tabs SessionStore state into a new tab
	const newTab = gBrowser.addTab(null, { skipAnimation: true, userContextId, });
	gSessionStore.setTabState(newTab, gSessionStore.getTabState(tab)); // "resource:///modules/sessionstore/TabState.jsm".clone provides a non-JSON version of this
	(tab.owner || tab._lastOwner) && (newTab.owner = tab.owner || tab._lastOwner);

	if (!gBrowser.treeStyleTab) {
		// restore the position
		gBrowser.moveTabTo(newTab, tab._tPos + 1);

		// close the original tab, but skip animations and the gSessionStore
		if (gBrowser._beginRemoveTab(tab, true, null, false)) {
			gBrowser._endRemoveTab(tab);
		}
	} else {
		// restore the position in the tree
		gBrowser.treeStyleTab.moveTabSubtreeTo(newTab, tab._tPos + 1);
		const parent = gBrowser.treeStyleTab.getParentTab(tab);
		parent && gBrowser.treeStyleTab.attachTabTo(newTab, parent, {
			dontAnimate: true, insertBefore: gBrowser.treeStyleTab.getNextTab(tab),
		});
		gBrowser.treeStyleTab.getChildTabs(tab).forEach(child => {
			gBrowser.treeStyleTab.attachTabTo(child, newTab, { dontAnimate: true, });
		});

		// close the original tab and remove it from the recently closed tabs list
		// using _beginRemoveTab() and _endRemoveTab() confuses Tree Style Tabs
		const gWindow = gBrowser.ownerGlobal;
		const maxTabsUndo = browserPrefs.getIntPref('sessionstore.max_tabs_undo');
		const lastClosedTabCount = gSessionStore.getClosedTabCount(gWindow);
		browserPrefs.setIntPref('sessionstore.max_tabs_undo', maxTabsUndo + 1);
		gBrowser.removeTab(tab);
		if (gSessionStore.getClosedTabCount(gWindow) === lastClosedTabCount + 1) {
			gSessionStore.forgetClosedTab(gWindow, 0);
		}
		browserPrefs.setIntPref('sessionstore.max_tabs_undo', maxTabsUndo); // will remove the last entry
	}
}

/**
 * Calls `unloadTab` on all tabs in `gBrowser` except for `tab`.
 * @param  {<tabbrowser>}  gBrowser  Tabbrowser whose tabs should be unloaded.
 * @param  {<tab>}         tab       A single tab instance to exclude.
 */
function unloadOtherTabs(gBrowser, tab) {
	forEach(gBrowser.visibleTabs, other => other !== tab && unloadTab(gBrowser, other));
}

/**
 * Calls `unloadTab` on all selected tabs in `gBrowser`.
 * Gets the selected tabs from the Multiple Tab Handler add-on.
 * If that is not installed or if the selection is empty, the `tab` parameter is used as selection.
 * @param  {<tabbrowser>}  gBrowser  Tabbrowser whose tabs should be unloaded.
 * @param  {<tab>}         tab       A single tab instance to exclude.
 * @param  {bool}          Invert    Invert selection. If true, all unselected tabs are unloaded.
 */
function unloadSelectedTabs(gBrowser, tab, invert) {
	const { MultipleTabService, } = gBrowser.ownerGlobal;
	const selected = MultipleTabService && MultipleTabService.getSelectedTabs();
	if (!selected || !selected.length) {
		(invert ? unloadOtherTabs : unloadTab)(gBrowser, tab);
	} else {
		(!invert ? selected : filter(
			gBrowser.visibleTabs,
			tab => !MultipleTabService.isSelected(tab)
		))
		.forEach(tab => unloadTab(gBrowser, tab));
	}
}

/**
 * Calls `unloadTab` on this tab and its descendants.
 * @param  {<tabbrowser>}  gBrowser  Tabbrowser whose tabs should be unloaded.
 * @param  {<tab>}         tab       The root of the tree to unload.
 */
function unloadSubtree(gBrowser, tab) {
	forEach(gBrowser.treeStyleTab.getDescendantTabs(tab), child => unloadTab(gBrowser, child));
	unloadTab(gBrowser, tab);
}

/**
 * Sets the next tab left or right of the current tab that is loaded as the selected tab.
 * @param  {bool}  backwards  If true, selects next on the left.
 */
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
	const singleMenu = tabContainer.contextMenu;
	const mulitMenu = singleMenu.parentNode.children['multipletab-selection-menu'];
	const self = _private(gBrowser);

	let currentTab = null;
	const onContext = self.onContext = event => {
		const menu = event.target;
		currentTab = menu.contextTab || menu.triggerNode;
		currentTab.owner && (currentTab._lastOwner = currentTab.owner);

		const itemThis = addItem(
			'context_unloadTab',
			menu.children[menu === singleMenu ? 'context_reloadTab' : 'multipletab-selection-reloadTabs'].nextSibling,
			menu === singleMenu ? 'Unload Tab' : 'Unload Selected Tabs',
			event => unloadSelectedTabs(gBrowser, currentTab, false)
		);
		const itemOthers = addItem(
			'context_unloadOtherTabs',
			itemThis.nextSibling,
			'Unload Other Tabs',
			event => unloadSelectedTabs(gBrowser, currentTab, true)
		);
		const itemTree = menu === singleMenu && gBrowser.treeStyleTab && addItem(
			'context_unloadSubtree',
			itemOthers.nextSibling,
			'Unload this Tree',
			event => unloadSubtree(gBrowser, currentTab)
		);

		itemThis[menu === singleMenu && currentTab.getAttribute('pending') ? 'setAttribute' : 'removeAttribute']('disabled', 'true');
		itemTree && itemTree[!gBrowser.treeStyleTab.hasChildTabs(currentTab) ? 'setAttribute' : 'removeAttribute']('hidden', 'true');

		function addItem(id, next, label, oncommand) {
			let item = menu.children[id];
			if (item) { return item; }

			item = document.createElement('menuitem');
			item.id = id;
			item.class = 'menu-iconic';
			item.setAttribute('label', label);
			menu.insertBefore(item, next);
			item.addEventListener('command', oncommand);
			addedMenuItens.add(item);
			return item;
		}
	};

	const onClose = self.onClose = ({ target: tab, }) => {
		if (!tab.selected) { return; }
		gBrowser.selectedTab = findClosestNonPending(tabContainer.children, tab, {
			filter: tab => !tab.getAttribute('hidden'),
		});
	};

	tabContainer.addEventListener('TabClose', onClose, false);
	singleMenu.addEventListener('popupshowing', onContext, false);
	mulitMenu && mulitMenu.addEventListener('popupshowing', onContext, false);

	self.styleElement = document.insertBefore(
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
	const singleMenu = tabContainer.contextMenu;
	const mulitMenu = singleMenu.parentNode.children['multipletab-selection-menu'];
	const { onClose, onContext, styleElement, } = _private(gBrowser);

	tabContainer && tabContainer.removeEventListener('TabClose', onClose, false);
	singleMenu   && singleMenu.removeEventListener('popupshowing', onContext, false);
	mulitMenu    && mulitMenu.removeEventListener('popupshowing', onContext, false);
	styleElement && styleElement.remove();
}

/**
 * addons main entry point
 */
function startup() {
	_private = new NameSpace();
	forEach(Windows, windowOpened);
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
	forEach(Windows, windowClosed);
	addedMenuItens.forEach(item => item.remove());
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
