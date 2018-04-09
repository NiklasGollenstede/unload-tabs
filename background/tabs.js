(function(global) { 'use strict'; define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'node_modules/web-ext-utils/browser/': { Tabs, },
	'node_modules/web-ext-utils/utils/event': { setEvent, },
	'common/options': options,
	module,
}) => { /* global setTimeout, */
let debug, debug2; options.debug.whenChange(([ value, ]) => { debug = value; debug2 = value >= 2; });

/**
 * Synchronous cache for Tabs.get/.query()
 */
// browser.tabs properties
const exports = module.exports = {
	update: Tabs.update, discard: Tabs.discard, query,
	// get/query falling back to native Tabs while the module is disabled
	getAsync() { return enabled ? tabs.get(...arguments) : Tabs.get(...arguments); },
	queryAsync() { return enabled ? query(...arguments) : Tabs.query(...arguments); },
	// get the active or previous active tab in a window
	active(windowId) { return tabs.get(active.get(windowId)) || null; },
	previous(windowId) { return tabs.get(previous.get(windowId)) || null; },
	// enables or disables the module, disabled by default
	setEnabled(bool) { bool ? enable() : disable(); },
	// inherits Map methods (including synchronous get)
	__proto__: new Map,
}; void find;
const fireCreated = setEvent(exports, 'onCreated', { lazy: false, });
const fireUpdated = setEvent(exports, 'onUpdated', { lazy: false, });
const fireRemoved = setEvent(exports, 'onRemoved', { lazy: false, });

/// implementation

// cache
const tabs = Object.getPrototypeOf(exports); // new Map/*<id,{ id, discarded, active, hidden, status, windowId, index, pinned, }>*/;
const active = new Map/*<windowId,id>*/, previous = new Map/*<windowId,id>*/;


// initialize
let enabled = false; const listeners = [ ];
function listen(event, listener) { listeners.push([ event, listener, ]); }
function ensureEnabled() { if (!enabled) { throw new Error(`Tabs cache is not active`); } }
async function enable() {
	if (enabled) { return; } enabled = true;
	listeners.forEach(([ event, listener, ]) => event.addListener(listener));
	(await Tabs.query({ })).forEach(props => {
		// BUG[FF60]: FF *sometimes* reports never-loaded tabs as not discarded (this is supposed to be fixed, but it does still happen in FF60)
		if (!props.discarded && props.isArticle === undefined && props.status === 'complete') {
			debug && console.warn('[BUG] pending tab reported as non-discarded', id);
			props.discarded = true;
		}
		addTab(props);
	});
	query({ active: true, }).forEach(setActive);
}
async function disable() {
	if (!enabled) { return; } enabled = false;
	listeners.forEach(([ event, listener, ]) => event.removeListener(listener));
	tabs.clear();
}


// add and basic update
listen(Tabs.onCreated, function (props) {
	debug2 && console.log('onCreated', ...arguments);
	addOrUpdateTab(props.id, props, props);
});
listen(Tabs.onUpdated, function (id, change, props) {
	debug2 && console.log('onUpdated', ...arguments);

	// BUG[FF60]: When loading unloaded tab, the favIconUrl is restored, but that is not always reported properly.
	// ('status' in change) && ('favIconUrl' in props) && Tabs.get(id).favIconUrl !== props.favIconUrl && (change.favIconUrl = props.favIconUrl); // don't need it

	addOrUpdateTab(id, change, props);
});
function addOrUpdateTab(id, change, props) {
	// BUG[FF60]: tabs sometimes get updated before they are created, so direct both events here
	// and decide based on the existence of the target tab what it actually is
	const tab = tabs.get(id); if (tab) {
		debug && change === props && console.warn('[BUG] receiving create update for existing tab', id);
		// if there was an early update, it's index may have been wrong,
		// so explicitly move the tab to fix the .index of shifted tabs
		if (change === props && tab.index !== change.index) { moveTab(tab.id, tab.index, change.index); }
		updateTab(tab, change); // apply whatever else might have changed
		// TODO: which information would actually be correct, the early update or the late crate?
	} else { addTab(props); }
}
function updateTab(tab, change) {
	let changed = false; Object.entries(change).forEach(([ key, value, ]) => {
		if (!(key in tab) || tab[key] === value) { delete change[key]; }
		else { tab[key] = value; changed = true; }
	}); if (!changed) { return; }

	debug2 && console.log('fireUpdated', tab.id, change, clone(tab));
	fireUpdated([ tab, change, ]);
}
function addTab({ id, discarded, active, hidden, status, windowId, index, pinned, }) {
	const tab = {
		id: +id, discarded: discarded || false, active: active || false, hidden: hidden || false,
		status, windowId: +windowId, index: +index, pinned: pinned || false, __proto__: null,
		restoring: false, // custom
	}; tabs.set(id, tab);

	debug2 && console.log('fireCreated', id, clone(tab));
	fireCreated([ tab, ]);

	query({ windowId, }).forEach(tab => tab.index > index && updateTab(tab, { index: tab.index + 1, }));
}


// activate (focus)
listen(Tabs.onActivated, function ({ tabId: id, windowId, }) {
	debug2 && console.log('onActivated', ...arguments);
	const tab = tabs.get(id), last = find({ windowId, active: true, });

	// BUG[FF60]: If a not-restored tab it incorrectly not marked as discarded, onUpdated won't fire.
	// Normally, it fires before onActivated.
	tab.discarded && updateTab(tab, { discarded: false, });

	setActive(tab); updateTab(tab, { active: true, }); last && updateTab(last, { active: false, });
});
function setActive(tab) {
	previous.set(tab.windowId, active.get(tab.windowId)); active.set(tab.windowId, tab.id);
}


// move within window
listen(Tabs.onMoved, (id, { fromIndex, toIndex, }) => moveTab(id, fromIndex, toIndex));
function moveTab(id, from, to) {
	debug2 && console.log('moveTab', ...arguments);
	const tab = tabs.get(id); updateTab(tab, { index: to, });
	const move = query({ windowId: tab.windowId, });
	if (from < to) {
		move.forEach(tab => tab.index > from && tab.index <= to && updateTab(tab, { index: tab.index - 1, }));
	} else {
		move.forEach(tab => tab.index < from && tab.index >= to && updateTab(tab, { index: tab.index + 1, }));
	}
}


// moved to window (from other window)
listen(Tabs.onAttached, function (id, { newWindowId, newPosition: newIndex, }) {
	debug2 && console.log('onAttached', ...arguments);
	const tab = tabs.get(id); const { windowId: oldWindowId, index: oldIndex, } = tab;
	query({ windowId: oldWindowId, }).forEach(tab => tab.index >  oldIndex && updateTab(tab, { index: tab.index - 1, }));
	query({ windowId: newWindowId, }).forEach(tab => tab.index >= newIndex && updateTab(tab, { index: tab.index + 1, }));
	updateTab(tab, { windowId: newWindowId, index: newIndex, });
});


// closed
listen(Tabs.onRemoved, function (id, { isWindowClosing, }) { setTimeout(() => {
	debug2 && console.log('onRemoved', ...arguments);
	const tab = tabs.get(id), { windowId, index, active, } = tab; tabs.delete(id);

	debug2 && console.log('fireRemoved', id, clone(tab));
	fireRemoved([ tab, { isWindowClosing, }, ]);

	!isWindowClosing && query({ windowId, }).forEach(tab => tab.index > index && updateTab(tab, { index: tab.index - 1, }));
	debug2 && !isWindowClosing && active && console.warn('removed active tab');
}); });


// get the first or all tabs that match the criteria
function queryOrFind(one, query) {
	ensureEnabled();
	query = Object.entries(query);
	const res = [ ]; for (const [ , tab, ] of tabs) {
		if (query.every(([ key, value, ]) => value === undefined || tab[key] === value)) {
			if (one) { return tab; } else { res.push(tab); }
		}
	} return one ? null : res;
}
function query(props) { return queryOrFind(false, props); }
function find (props) { return queryOrFind(true,  props); }

function clone(arg) {
	return JSON.parse(JSON.stringify(arg));
}

}); })(this);
