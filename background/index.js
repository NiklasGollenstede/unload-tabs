(function(global) { 'use strict'; define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'node_modules/web-ext-utils/browser/': { Menus, Commands, Windows, WebRequest, },
	'node_modules/web-ext-utils/utils/': { reportError, /*reportSuccess,*/ },
	'node_modules/web-ext-utils/update/': updated,
	'common/options': options,
	Tabs,
	require, module,
}) => { /* global setTimeout, */
let debug, debug2; options.debug.whenChange(([ value, ]) => { debug = value; debug2 = value >= 2; });
debug && console.info('Ran updates', updated);

/**
 * Firefox bugs affecting this extension (FF60):
 *  * [BUG]  tabs can be put in a state { discarded: true, state: 'loading', } which they don't leave automatically (might only happening when discarding a tab that is about to load after sessionrestore)
 *      * reported as #1450371
 *  * [BAD]  loading discarded/pending tabs removes the favicon, which will be missing when the tab is discarded again before the favicon is restored
 *      * reported as #1450382
 *  * [BUG]  tabs.onUpdated doesn't always report favIconUrl (when restoring discarded tabs)
 *      * reported as #1450384
 *  * [API]  favIconUrl can't be set
 *      * requested in #1450386
 *  * [BUG?] never loaded tabs are not discarded (but internally pending) (this is supposed to be fixed and I can't reproduce it, but it did happen in FF60)
 * Also:
 *  * [BUG?] calling tabs.executeScript() for discarded tabs loads them
 *  * [BUG]  calling tabs.executeScript() for never-loaded tabs only resolves after the tab is manually loaded (should reject or behave as if the tab was discarded)
 */

/**
 * Interesting issues (https://bugzilla.mozilla.org/show_bug.cgi?id=<id>):
 * * [1420681]: let `Tabs.discard( , { forceDiscard:true, })`` discard tabs with 'beforeunload' handlers
 * * [1303384]: UI for re-assigning an extension's command shortcut
 * * [1320332]: Support overriding existing keybinding through WebExtensions (e.g. allow "Ctrl+Page(Up|Down)" or "Ctrl(+Shift)+Tab")
 */


// only keep track of Tabs while options.onClose.value is true
let onClose = false; options.onClose.whenChange(([ value, ]) => {
	onClose = value;
	Tabs.setEnabled(onClose); // must listen first
	[ onRemoved, onActivated, onUpdated, ].forEach(func =>
		Tabs[func.name][onClose ? 'addListener' : 'removeListener'](func)
	);
});


// keep a copy of the tab that last had its favicon removed (which is pointless as the favIconUrl cant be set, see bugzilla#1450386)
/*let lastRemovedFavicon = null; Tabs.onUpdated.addListener((id, change) => { // must run first
	if ('discarded' in change) { return; }
	lastRemovedFavicon = change.favIconUrl === null && onClose ? clone(Tabs.get(id)) : null;
	debug2 && console.log('lastRemovedFavicon', lastRemovedFavicon, lastRemovedFavicon && lastRemovedFavicon.favIconUrl);
});*/


// add menus
Menus.create({
	title: 'Unload Tab',
	id: 'unloadTab',
	icons: { 64: 'icon.png', },
	contexts: [ 'tab', 'tools_menu', ],
});
Menus.create({
	title: 'Unload Other Tabs',
	id: 'unloadOtherTabs',
	icons: { 32: 'many.png', },
	contexts: [ 'tools_menu', ],
});


// respond to menu click
Menus.onClicked.addListener(async ({ menuItemId, }, { id, }) => { const tab = Tabs.get(id); try { switch (menuItemId) {
	case 'unloadTab': {
		if (tab.active) { const alt = onClose && findNext(tab); if (alt) {
			(await Tabs.update(alt.id, { active: true, }));
		} else {
			reportError('Not unloading', onClose ? 'No Tab to switch to' : 'Tab switching is disabled');
		} }
		(await Tabs.discard(tab.id));
	} break;
	case 'unloadOtherTabs': {
		(await Tabs.discard(Tabs.query({
			discarded: false, windowId: tab.windowId, pinned: tab.pinned ? undefined : false,
		}).filter(_=>_.id !== tab.id).map(_=>_.id)));
	} break;
} } catch (error) { reportError(error); } });


// respond to (keyboard) commands
Commands && Commands.onCommand.addListener(async command => { {
	debug2 && console.log('command', command);
} try { switch (command.replace(/_\d$/, '')) {
	case 'prevLoadedTab': (await seek(-1)); break;
	case 'nextLoadedTab': (await seek(+1)); break;
} } catch (error) { reportError(error); } });
async function seek(direction) {
	const window = (await Windows.getLastFocused({ windowTypes: [ 'normal', ], populate: !onClose, }));
	const tabs = (window.tabs || Tabs.query({ windowId: window.id, })).sort((a, b) => a.index - b.index);
	const start = tabs.findIndex(_=>_.active);  if (start < 0) { return; }

	function find(tab) { return tab && !tab.discarded && !tab.hidden && (alt = tab); }
	function increment(index) { return (index + direction + tabs.length) % tabs.length; }
	let alt; for ( // search in one direction, wrap around and return the original tab if no other is found
		let i = increment(start);
		i !== start && !find(tabs[i]);
		i = increment(i)
	) { void 0; }

	alt && (await Tabs.update(alt.id, { active: true, }));
}
options.commands.onAnyChange(async ([ primary, secondary, ], _, { name, }) => {
	const commands = (await Commands.getAll());
	for (const [ suffix, value, ] of Object.entries({ '': primary, _2: secondary, })) {
		const command = commands.find(_=>_.name === name + suffix); delete command.shortcut;
		if (value) { command.shortcut = value.replace(/Key|Digit|Numpad|Arrow/, ''); }
		(await Commands.update(command));
	}
});


// respond to tab close
let activating = null;
async function onRemoved(id) { // choose the next active tab
	// debug2 && console.log('closing', id, Tabs.get(id));
	const tab = Tabs.get(id); if (!tab.active) { return; }
	const alt = findNext(Tabs.get(id)); if (!alt) { return; }
	debug && console.info('closing tab', id, ', activating', alt.id);
	activating = alt.id; setTimeout(() => activating === alt.id && (activating = null), 500);
	setTimeout(() => Tabs.update(alt.id, { active: true, }), 1000);
}
async function onActivated({ tabId: id, }) { // don't allow the wrong tab to be activated (shortly after closing)
	if (!activating || activating === id) { return; }
	debug && console.warn('focusing wrong tab', id, clone(Tabs.get(id)));
	Tabs.update(activating, { active: true, });
	for (const time of [ 10, 35, 70, 120, 300, ]) { (await sleep(time));
		Tabs.update(activating, { active: true, }); debug && console.info('force activate', id);
	}
}
async function onUpdated(id, change) { // don't allow tabs to load that are not active
	if (change.discarded !== false) { return; }
	const tab = Tabs.get(id); if (tab.active) { return; }
	// this also happens when legitimately focusing an unloaded tab (they won't be activated yet), but discarding won't have an effect
	debug && console.warn('background tab loads', id, clone(Tabs.get(id)));
	// const favIconUrl = lastRemovedFavicon && lastRemovedFavicon.id === id && lastRemovedFavicon.favIconUrl;
	Tabs.discard(id); tab.discarded = true; // so that on the close event (which happens after this one in FF60) this tab won't be selected
	for (const time of [ 10, 35, 70, 120, 300, ]) { (await sleep(time));
		Tabs.discard(id); debug && console.info('force discard', id);
	}
	// !tab.favIconUrl && favIconUrl && Tabs.update(id, { favIconUrl, }); // restore favicon
}
// restoring tabs doesn't do any webRequests and webNavigation can't be canceled
/*WebRequest.onBeforeRequest.addListener( // don't allow tabs to load that are discarded
	({ tabId: id, url, }) =>  { console.warn('load', url); return Tabs.get(id).discarded ? ({ cancel: true, }) : null; },
	{ types: [ 'main_frame', ], urls: [ '<all_urls>', ] }, [ 'blocking', ],
);*/


// get next loaded tab (on close or unload)
function findNext(tab) { const { openerTabId, windowId, index, pinned, discarded, } = tab;
	debug2 && console.log('findNext', ...arguments);
	let found = null; function find(tab) { return tab && !tab.discarded && !tab.hidden && (found = tab); }

	if (options.onClose.children.previous.value) {
		if (find(Tabs.previous(windowId))) { debug2 && console.log('prev'); return found; }
	}

	const tabs = Tabs.query({ windowId, }).sort((a, b) => a.index - b.index);
	const start = tabs.indexOf(tab); if (start < 0) { return null; }
	const direction = options.onClose.children.direction.value;

	debug2 && console.log(clone(tabs), tab, start);

	for ( // search up and down at the same time. No need to wrap around
		let j = start + direction, i = start - direction, length = tabs.length;
		(j >= 0 && j < length || i >= 0 && i < length) && !(find(tabs[j]) || find(tabs[i]));
		j += direction, i -= direction
	) { void 0; }
	return found;
}


// utils
function sleep(time) {
	return new Promise(done => setTimeout(done, time));
}
function clone(arg) {
	return JSON.parse(JSON.stringify(arg));
}


// debug stuff
Object.assign(global, module.exports = {
	Browser: require('node_modules/web-ext-utils/browser/'),
	options, Tabs,
});


}); })(this);
