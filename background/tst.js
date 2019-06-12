(function(global) { 'use strict'; define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'node_modules/web-ext-utils/browser/': { manifest, Runtime, Menus, },
	'common/options': options,
	require,
}) => {
let debug; options.debug.whenChange(([ value, ]) => { debug = value >= 2; });
let onClicked, menus; require([ './', ], index => ({ onClicked, menus, } = index)); // cyclic

const TST_ID = 'treestyletab@piro.sakura.ne.jp';

const unloadTreeMenu = {
	id: 'unloadTree',
	title: 'Unload Tree',
	contexts: [ 'tab', ],
	viewTypes: [ 'sidebar', ],
};

const onError = console.error.bind(console, 'TST error');

async function register() {
	(await Runtime.sendMessage(TST_ID, {
		type: 'register-self',
		name: manifest.name,
		icons: manifest.icons,
		listeningTypes: [ ],
		style: options['intregrate.tst'].children.style.value,
	}));
	(await Promise.all(Object.values(menus).map(menu => Runtime.sendMessage(TST_ID, {
		type: 'fake-contextMenu-create', params: menu,
	}))));
	(await Runtime.sendMessage(TST_ID, {
		type: 'fake-contextMenu-create', params: unloadTreeMenu,
	}));
}

async function onMessageExternal(message, sender) { {
	debug && console.log('onMessageExternal', ...arguments);
	if (sender.id !== TST_ID) { return false; }
} try { switch (message.type) {
	case 'ready': register().catch(onError); break;
	case 'fake-contextMenu-click': onClicked(message.info, message.tab);
} } catch (error) { console.error('TST error', error); } {
	return true; // indicate to TST that the event was handled
} }

function updateMenu([ value, ], _, { name, }) {
	Runtime.sendMessage(TST_ID, {
		type: 'fake-contextMenu-update', params: [ name, { contexts: value.split(' '), }, ],
	}).catch(onError);
}

return {
	// the very first tst.enable() has to happen while TST is already running for the initial registration to work
	// also, this is somewhat racy: calling disable() and enable() before the other one was done can lead to unexpected states
	enable() {
		Runtime.onMessageExternal.addListener(onMessageExternal);
		options.menus.children.unloadOtherTabs.onChange.addListener(updateMenu);
		options.menus.children.unloadAllTabs.onChange.addListener(updateMenu);
		register().catch(() => null); // may very well not be ready yet
		Menus.create(unloadTreeMenu, () => Runtime.lastError && console.error('TST error (create native menu)', Runtime.lastError)); // (why doesn't this return a promise?!)
	},
	disable() {
		Runtime.onMessageExternal.removeListener(onMessageExternal);
		options.menus.children.unloadOtherTabs.onChange.removeListener(updateMenu);
		options.menus.children.unloadAllTabs.onChange.removeListener(updateMenu);
		Runtime.sendMessage(TST_ID, { type: 'unregister-self', }).catch(onError);
		Menus.remove(unloadTreeMenu.id).catch(error => console.error('TST error (remove native menu)', error));
	},
	async getChildren(tabId) {
		const tree = (await Runtime.sendMessage(TST_ID, { type: 'get-tree', tab: tabId, }));
		const tabs = [ ]; (function flatten(tree) {
			tabs.push(tree); tree.children.forEach(flatten);
		})(tree); return tabs;
	},
};

}); })(this);
