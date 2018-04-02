(function(global) { 'use strict'; define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'node_modules/web-ext-utils/browser/': { Runtime, },
	'node_modules/web-ext-utils/browser/': { manifest, },
	'common/options': options,
	require,
}) => {
let debug; options.debug.whenChange(([ value, ]) => { debug = value >= 2; });
let onClicked, menus; require([ './', ], index => ({ onClicked, menus, } = index)); // cyclic

const TST_ID = 'treestyletab@piro.sakura.ne.jp';


async function register() {
	(await Runtime.sendMessage(TST_ID, {
		type: 'register-self',
		name: manifest.name,
		icons: manifest.icons,
		listeningTypes: [ ],
		style: `.tab.discarded { opacity: 0.6; }`,
	}));
	(await Runtime.sendMessage(TST_ID, {
		type: 'fake-contextMenu-create',
		params: menus.unloadTab,
	}));
}


async function onMessageExternal(message, sender) { {
	debug && console.log('onMessageExternal', ...arguments);
	if (sender.id !== TST_ID) { return; }
} try { switch (message.type) {
	case 'ready': (await register()); break;
	case 'fake-contextMenu-click': (await onClicked(message.info, message.tab));
} } catch (error) { console.error('TST error', error); } }


return {
	enable() {
		Runtime.onMessageExternal.addListener(onMessageExternal);
		register().catch(() => null);
	},
	disable() {
		Runtime.onMessageExternal.removeListener(onMessageExternal);
		Runtime.sendMessage(TST_ID, { type: 'unregister-self', }).catch(() => null);
	},
};

}); })(this);
