(function(global) { 'use strict'; define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'node_modules/web-ext-utils/browser/': { Menus, Commands, Windows, Tabs: _Tabs, },
	'node_modules/web-ext-utils/utils/notify': notify,
	'node_modules/web-ext-utils/update/': updated,
	'common/options': options,
	Tabs, tst,
	require, module,
}) => { /* global setTimeout, */
let debug, debug2; options.debug.whenChange(([ value, ]) => { debug = value; debug2 = value >= 2; });
Object.assign(global, { Browser: require('node_modules/web-ext-utils/browser/'), options, Tabs, tst, });
debug && console.info('Ran updates', updated);


/**
 * Firefox bugs affecting this extension (FF60):
 *  * [BUG]  tabs can be put in a state { discarded: true, state: 'loading', } which they don't leave automatically (might only happening when discarding a tab that is about to load after sessionrestore)
 *      * reported as #1450371
 *  * [BAD]  loading discarded/pending tabs removes the favicon, which will be missing when the tab is discarded again before the favicon is restored
 *      * reported as #1450382
 *      * sometimes (very rarely), the tab is even displayed and reported as a blank tab { title: 'New Tab', url: 'about:newtab/blank', }
 *  * [BUG]  tabs.onUpdated doesn't always report favIconUrl (when restoring discarded tabs)
 *      * reported as #1450384
 *  * [API]  favIconUrl can't be set
 *      * requested in #1450386
 *  * [BUG?] never loaded tabs are not discarded (but internally pending)
 *      * this is supposed to be fixed, but it does (sometimes?) happen in FF60
 *      * as a consequence, onUpdated(, { discarded: false, }) won't fire
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
	onClose = value; Tabs.setEnabled(onClose);
});


// add menus
const menus = {
	unloadTab: {
		title: 'Unload Tab',
		icons: { 64: 'icon.png', },
		contexts: [ 'tab', 'tools_menu', ],
	},
	unloadOtherTabs: {
		title: 'Unload Other Tabs',
		icons: { 32: 'many.png', },
		contexts: options.menus.children.unloadOtherTabs.value.split(' '),
	},
	unloadAllTabs: {
		title: 'Unload in All Windows',
		contexts: options.menus.children.unloadAllTabs.value.split(' '),
	},
}; Object.keys(menus).forEach(id => (menus[id].id = id));
Object.values(menus).forEach(menu => Menus.create(menu));
options.menus.children.unloadOtherTabs.onChange(updateMenu);
options.menus.children.unloadAllTabs.onChange(updateMenu);
function updateMenu([ value, ], _, { name, }) {
	menus[name].contexts = value.split(' ');
	Menus.update(name, { contexts: value.split(' '), });
	if (options['intregrate.tst'].value) { tst.disable(); tst.enable(); }
}
// could use .onShown and .update(, { enabled, }) .refresh()


// Tree Style Tab integration
options['intregrate.tst'].value && tst.enable();
options['intregrate.tst'].onChange(([ value, ]) => value ? tst.enable() : tst.disable());


// respond to menu click
addWrappedListener(Menus, onClicked);
async function onClicked({ menuItemId, }, { id, active, windowId, pinned, }) { switch (menuItemId) {
	case 'unloadTab': {
		if (active) {
			const tabs = (await Tabs.queryAsync({ windowId, })), i = tabs.findIndex(_=>_.active);
			const alt = findNext(tabs[i], tabs) || !onClose && (tabs[i + 1] || tabs[i - 1]);
			if (alt) { (await Tabs.update(alt.id, { active: true, })); }
			else { notify.info('Not unloading', 'No Tab to switch to'); return; }
		}
		discarding = id; setTimeout(() => discarding === id && (discarding = null), 500);
		(await Tabs.discard(id));
		(await sleep(1000));
		!(await Tabs.getAsync(id)).discarded && notify.warn(
			'Failed to unload tab',
			`Some browser UI tabs and tabs with prompts on close can't be unloaded.`,
		);
	} break;
	case 'unloadOtherTabs': {
		unload((await Tabs.queryAsync({
			discarded: false, windowId, pinned: pinned ? undefined : false,
		})).filter(_=>_.id !== id));
	} break;
	case 'unloadAllTabs': {
		unload((await Tabs.queryAsync({
			discarded: false,
		})));
	} break;
	case 'unloadTree': {
		unload((await tst.getChildren(id)));
	} break;
} function unload(tabs) { Tabs.discard(tabs.map(_=>_.id)).catch(error => { // not sure when and why this can happen
	const match = (/^Invalid tab ID: (\d+)$/).exec(error && error.message);
	if (!match || !Tabs.delete(+match[1])) { throw error; }
	debug && console.wran(`[BUG] .onRemoved for tab ${match[1]} was never fired`);
	onClicked.apply(null, arguments);
}); } }
// BUG[FF60]: tab will report as loading and non-discarded directly after discarding,
// but that doesn't reflect in the UI. Discarding it again fixes the tab state
let discarding = null; addWrappedListener(_Tabs, function onUpdated(id, change) {
	if (id !== discarding || change.discarded !== false) { return; }
	debug && console.warn('[BUG] just-discarded tab updating as non-discarded', id);
	Tabs.discard(id);
});


// respond to (keyboard) commands
Commands && addWrappedListener(Commands, onCommand);
async function onCommand(command) { {
	debug2 && console.log('command', command);
} switch (command.replace(/_\d$/, '')) {
	case 'unloadSelectedTab': (await onClicked({ menuItemId: 'unloadTab', }, (await Tabs.queryAsync({
		active: true, windowId: (await Windows.getLastFocused({ windowTypes: [ 'normal', ], })).id,
	}))[0])); break;
	case 'prevLoadedTab': (await seekNext(-1)); break;
	case 'nextLoadedTab': (await seekNext(+1)); break;
} }
async function seekNext(direction) {
	const window = (await Windows.getLastFocused({ windowTypes: [ 'normal', ], populate: !onClose, }));
	const tabs = (window.tabs || Tabs.query({ windowId: window.id, discarded: false, hidden: false, })).sort((a, b) => a.index - b.index);
	const start = tabs.findIndex(_=>_.active); if (start < 0) { return; }

	function find(tab) { return tab && !tab.discarded && !tab.hidden && (alt = tab) || debug2 && void console.log('skipping tab', clone(tab)); }
	function increment(index) { return (index + direction + tabs.length) % tabs.length; }
	let alt; for ( // search in one direction, wrap around and return the original tab if no other is found
		let i = increment(start);
		i !== start && !find(tabs[i]);
		i = increment(i)
	) { void 0; }

	alt && (await Tabs.update(alt.id, { active: true, }));
}
options.commands.onAnyChange(async (values, _, { name, model: { maxLength, }, }) => {
	const commands = (await Commands.getAll());
	for (let i = 0; i < maxLength; ++i) {
		const id = name + (i ? '_'+ i : ''), command = commands.find(_=>_.name === id);
		command.shortcut = values[i] || null;
		if (command.shortcut) { try {
			(await Commands.update(command));
		} catch (error) {
			Commands.reset(id); throw error;
		} } else {
			Commands.reset(id); // can't remove, so must only allow not to set if default is unset
		}
	}
});


// respond to tab close
let activating = null, restoring = null;
Tabs.onRemoved(async (tab, { isWindowClosing, }) => {
	if (isWindowClosing || !tab.active && !restoring) { return; }
	debug2 && console.log('active tab closing', tab.id, tab);

	const alt = findNext(tab); if (!alt) { return; }
	debug && console.info('activating', alt.id);

	activating = alt.id; setTimeout(() => activating === alt.id && (activating = null), 500);
	options.onClose.children.preemptive.value && Tabs.update(alt.id, { active: true, });
	if (restoring) { forceActivate(alt.id); forceDiscard(restoring); }
});
Tabs.onUpdated(async (tab, change) => {
	if (change.active === true && activating && activating !== tab.id) {
		debug && console.warn('wrong tab focusing', tab.id, clone(tab));

		(await forceActivate(activating));
	}
	if (change.discarded === false && !tab.active) {
		debug && console.warn('inactive tab restoring', tab.id, clone(tab));

		tab.restoring = true; setTimeout(() => (tab.restoring = false), 500); // TODO: wait for status === 'complete'?
		if (!activating) {
			restoring = tab.id; setTimeout(() => restoring === tab.id && (restoring = null), 500);
		} else { (await forceDiscard(tab.id)); }
	}
});
async function forceActivate(id) {
	debug && console.info('start force activate', id);
	Tabs.update(id, { active: true, });
	for (const time of [ 6, 12, 25, 45, /*70, 120,*/ ]) { (await sleep(time));
		Tabs.update(id, { active: true, }); debug && console.info('force activate', id);
	}
}
async function forceDiscard(id) {
	debug && console.info('start force discard', id);
	Tabs.discard(id);
	for (const time of [ 6, 12, 25, 45, /*70, 120,*/ ]) { (await sleep(time));
		Tabs.discard(id); debug && console.info('force discard', id);
	}
}
// restoring tabs doesn't do any webRequests and webNavigation can't be canceled


// get next loaded tab (on close or unload)
function findNext(tab, tabs) { const { windowId, } = tab;
	debug2 && console.log('findNext', ...arguments);
	let found = null; function find(tab) { if (
		tab && !tab.discarded && !tab.hidden && !tab.restoring
	) { found = tab; return true; } return false; }

	if (options.onClose.children.previous.value) {
		if (find(Tabs.previous(windowId))) { return found; }
	}

	tabs = (tabs || Tabs.query({
		windowId: tab.windowId, discarded: false, hidden: false, restoring: false,
	})).sort((a, b) => a.index - b.index);
	let start = tabs.indexOf(tab); if (start < 0) {
		while (++start < tabs.length && tabs[start].index < tab.index) { void 0; }
		tabs.splice(start, 0, null);
	}
	const direction = options.onClose.children.direction.value;
	// debug2 && console.log(clone(tabs), tab, start);

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

function addWrappedListener(api, func) {
	api[func.name].addListener(func.wrapped || (func.wrapped = async function() { try {
		(await func.apply(this, arguments));
	} catch (error) { notify.error(`Failed to handle ${func.name}`, error); } }));
}
/*function removeWrappedListener(api, func) {
	func.wrapped && api[func.name].removeListener(func.wrapped);
}*/


module.exports = {
	menus,
	onClicked, onCommand,
	findNext, seekNext,
};

}); })(this);
