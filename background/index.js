(function(global) { 'use strict'; define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'node_modules/web-ext-utils/browser/': { Tabs, Menus, },
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


// respond to tab close
let activating = null;
Tabs.onRemoved.addListener(async id => {
	// console.log('closing', id, tabs.get(id));
	const tab = tabs.get(id); if (!tab.active) { return; }
	const alt = findNext(tabs.get(id)); if (!alt) { return; }
	console.info('closing tab', id, ', activating', alt.id);
	activating = alt.id; setTimeout(() => activating === alt.id && (activating = null), 500);
	(await Tabs.update(alt.id, { active: true, }));
});
Tabs.onActivated.addListener(({ tabId: id, }) => {
	if (!activating || activating === id) { return; }
	console.warn('focusing wrong tab', id);
	Tabs.update(activating, { active: true, });
	function discard() { Tabs.discard(id); }
	discard(); [ 0, 10, 70, 300, ].forEach(time => setTimeout(discard, time));
});
Tabs.onUpdated.addListener((id, change) => {
	const tab = tabs.get(id);
	if (change.discarded === false && tab.active === false) {
		console.log('background tab loads', id, tab);
		Tabs.discard(id); tab.discarded = true;
	}
});


// utils
function findNext({ opener, windowId, index, pinned, discarded, }, inOrder) {
	console.log('findNext', ...arguments);
	let found = null; function find(tab) { return tab && !tab.discarded && (found = tab); }

	if (!inOrder) { switch (options.onClose.value) {
		case 'none': return null;
		case 'opener-left': {
			if (find(tabs.get(opener))) { console.log('opener-left'); return found; }
		} break;
		case 'opener-right': {
			if (find(tabs.get(opener))) { console.log('opener-right'); return found; }
		} /* falls through */
		case 'right': {
			if (find(tabs.find({ windowId, index: index + 1, }))) { console.log('right'); return found; }
		} break;
		case 'left':
	} }

	const list = tabs.query({ windowId, /*pinned,*/ }).sort((a, b) => a.index - b.index);
	const start = list.indexOf(arguments[0]); if (start < 0) { return null; }

	console.log(clone(list), arguments[0], start, inOrder);

	if (inOrder) { if (!find(arguments[0])) { return null; } for (
		// search in one direction, wrap around and return the original tab if no other is found
		let i = (start + list.length) % list.length;
		!find(tabs[i]);
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
