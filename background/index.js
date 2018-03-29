(function(global) { 'use strict'; define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'node_modules/web-ext-utils/browser/': { Tabs, Menus, Commands, Windows, },
	'node_modules/web-ext-utils/utils/': { reportError, /*reportSuccess,*/ },
	'node_modules/web-ext-utils/update/': updated,
	'common/options': options,
	tabs,
	require, module,
}) => { /* global setTimeout, */
let debug; options.debug.whenChange(([ value, ]) => { debug = value; });
debug && console.info('Ran updates', updated);


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
Menus.onClicked.addListener(async ({ menuItemId, }, { id, }) => { const tab = tabs.get(id); try { switch (menuItemId) {
	case 'unloadTab': {
		if (tab.active) { const alt = findNext(tab); if (alt) {
			(await Tabs.update(alt.id, { active: true, }));
		} else {
			reportError('Not unloading', options.onClose.value !== 'none' ? 'No Tab to switch to' : 'Tab switching is disabled');
		} }
		(await Tabs.discard(tab.id));
	} break;
	case 'unloadOtherTabs': {
		(await Tabs.discard(tabs.query({
			pinned: tab.pinned , discarded: false, windowId: tab.windowId,
		}).filter(_=>_.id !== tab.id).map(_=>_.id)));
	} break;
} } catch (error) { reportError(error); } });


// respond to (keyboard) commands
Commands && Commands.onCommand.addListener(async command => { console.log('command', command); try { switch (command) {
	case 'prevLoadedTab': (await seek(-1)); break;
	case 'nextLoadedTab': (await seek(+1)); break;
} } catch (error) { reportError(error); } });
async function seek(direction) {
	const tab = tabs.active((await Windows.getLastFocused({ windowTypes: [ 'normal', ], })).id);
	const alt = tab && findNext(tab, direction);
	console.log('tab, alt', tab, alt);
	alt && (await Tabs.update(alt.id, { active: true, }));
}

// respond to tab close
let activating = null;
Tabs.onRemoved.addListener(async id => { // choose the next active tab
	// console.log('closing', id, tabs.get(id));
	const tab = tabs.get(id); if (!tab.active) { return; }
	const alt = findNext(tabs.get(id)); if (!alt) { return; }
	console.info('closing tab', id, ', activating', alt.id);
	activating = alt.id; setTimeout(() => activating === alt.id && (activating = null), 500);
	(await Tabs.update(alt.id, { active: true, }));
});
Tabs.onActivated.addListener(({ tabId: id, }) => { // don't allow the wrong tab to be activated (shortly after closing)
	if (!activating || activating === id) { return; }
	console.warn('focusing wrong tab', id, clone(tabs.get(id)));
	Tabs.update(activating, { active: true, });
	if (!tabs.get(id).discarded) { return; }
	function discard() { Tabs.discard(id); }
	discard(); [ 0, 10, 70, 300, ].forEach(time => setTimeout(discard, time));
});
Tabs.onUpdated.addListener((id, change) => { // don't allow tabs to load that are not active
	if (change.discarded !== false) { return; }
	const tab = tabs.get(id); if (tab.active) { return; }
	console.info('background tab loads', id, tab); // also happens when legitimately focusing an unloaded tab, but discarding won't have an effect
	Tabs.discard(id); tab.discarded = true;
});


// utils
function findNext(tab, inOrder) { const { openerTabId, windowId, index, pinned, discarded, } = tab;
	console.log('findNext', ...arguments);
	let found = null; function find(tab) { return tab && !tab.discarded && !tab.hidden && (found = tab); }

	if (!inOrder) { switch (options.onClose.value) {
		case 'none': return null;
		case 'prev': case 'prev-right':  {
			if (find(tabs.previous(windowId))) { console.log('prev-*'); return found; }
		} break;
		case 'right': {
			if (find(tabs.find({ windowId, index: index + 1, }))) { console.log('right'); return found; }
		} break;
		case 'left':
	} }

	const list = tabs.query({ windowId, /*pinned,*/ }).sort((a, b) => a.index - b.index);
	const start = list.indexOf(tab); if (start < 0) { return null; }

	console.log(clone(list), tab, start, inOrder);

	if (inOrder) { for (
		// search in one direction, wrap around and return the original tab if no other is found
		let i = (start + inOrder + list.length) % list.length;
		!find(list[i]) && list[i] !== tab;
		i = (i + inOrder + list.length) % list.length
	) { void 0; } }
	else { for ( // search up and down at the same time. No need to wrap around
		let j = start - 1, i = start + 1, length = list.length;
		(j >= 0 || i < length) && !(find(list[j]) || find(list[i]));
		--j, ++i
	) { void 0; } }
	return found;
}


// debug stuff
Object.assign(global, module.exports = {
	Browser: require('node_modules/web-ext-utils/browser/'),
	options,
});

function clone(arg) {
	return JSON.parse(JSON.stringify(arg));
}

}); })(this);
