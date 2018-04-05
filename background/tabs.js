(function(global) { 'use strict'; define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'node_modules/web-ext-utils/browser/': { Tabs, },
	'common/options': options,
	module,
}) => { /* global setTimeout, */
let debug; options.debug.whenChange(([ value, ]) => { debug = value >= 2; });

/**
 * Synchronous cache for Tabs.get/.query()
 */
// browser.tabs properties
const exports = module.exports = Object.create(Tabs);
setProp(exports, 'getAsync', function () { return Tabs.get(...arguments); });
setProp(exports, 'queryAsync', function () { return Tabs.query(...arguments); });
setProp(exports, 'getEither', function () { return enabled ? tabs.get(...arguments) : Tabs.get(...arguments); });
setProp(exports, 'queryEither', function () { return enabled ? query(...arguments) : Tabs.query(...arguments); });
// get all or first matching tab synchronously
setProp(exports, 'query', query); setProp(exports, 'find', find);
// get the active tab in a window
setProp(exports, 'active',   windowId => tabs.get(active.get(windowId)) || null);
// get the previous active tab in a window
setProp(exports, 'previous', windowId => tabs.get(previous.get(windowId)) || null);
// Map methods (including synchronous get)
[ 'get', 'has', 'entries', 'keys', 'values', 'forEach', Symbol.iterator, ]
.forEach(name => setProp(exports, name, function () { return Map.prototype[name].apply(tabs, arguments); }));
// manually enables or disables the module
setProp(exports, 'setEnabled', _=>_? enable() : disable());


/// implementation

// cache
const tabs = new Map/*<id,{ id, discarded, active, hidden, openerTabId, windowId, index, pinned, favIconUrl, }>*/;
const active = new Map/*<windowId,id>*/, previous = new Map/*<windowId,id>*/;


// initialize
let enabled = false; const listeners = [ ];
function listen(event, listener) { listeners.push([ event, listener, ]); }
function ensureEnabled() { if (!enabled) { throw new Error(`Tabs cache is not active`); } }
async function enable() {
	if (enabled) { return; } enabled = true;
	listeners.forEach(([ event, listener, ]) => event.addListener(listener));
	(await Tabs.query({ })).forEach(addTab);
	query({ active: true, }).forEach(setActive);
}
async function disable() {
	if (!enabled) { return; } enabled = false;
	listeners.forEach(([ event, listener, ]) => event.removeListener(listener));
	tabs.clear();
}


// add and basic update
listen(Tabs.onCreated, props => updateTab(props));
listen(Tabs.onUpdated, (id, change, props) => {
	// BUG[FF60]: When loading unloaded tab, the favIconUrl is restored, but that is not always reported properly.
	('status' in change) && ('favIconUrl' in props) && Tabs.get(id).favIconUrl !== props.favIconUrl && (change.favIconUrl = props.favIconUrl);

	updateTab(props, change);
});
function updateTab(props, change = props) {
	const tab = tabs.get(props.id); if (tab) {
		if (('index' in change) && tab.index !== change.index) { moveTab(tab.id, tab.index, change.index); }
		Object.entries(change).forEach(([ key, value, ]) => (key in tab) && (tab[key] = value));
		debug && console.log('updateTab', props.id, change, tab);
	} else { addTab(props); }
}
function addTab({ id, discarded, active, hidden, openerTabId, windowId, index, pinned, favIconUrl, }) {
	// BUG[FF60]: FF *sometimes* reports never-loaded tabs as not discarded (this is supposed to be fixed, but it does still happen in FF60)
	!discarded && arguments[0].isArticle === undefined && arguments[0].status === 'complete' && (discarded = true);

	tabs.set(id, { id, discarded, active, hidden, openerTabId, windowId, index, pinned, favIconUrl, __proto__: null, });
	query({ windowId, }).forEach(tab => tab.index > index && tab.index++);
	debug && console.log('addTab', id, tabs.get(id));
}


// activate (focus)
listen(Tabs.onActivated, function ({ tabId: id, windowId, }) {
	debug && console.log('onActivated', ...arguments);
	const last = find({ windowId, active: true, }); last && (last.active = false); // old in same window
	const tab = tabs.get(id); tab.active = true; setActive(tab);

	// BUG[FF60]: If a not-restored tab it incorrectly not marked as discarded, onUpdated won't fire.
	// Normally, it fires before onActivated.
	tabs.get(id).discarded && updateTab({ id, }, { discarded: false, });
});
function setActive(tab) {
	previous.set(tab.windowId, active.get(tab.windowId)); active.set(tab.windowId, tab.id);
}


// move within window
listen(Tabs.onMoved, (id, { fromIndex, toIndex, }) => moveTab(id, fromIndex, toIndex));
function moveTab(id, from, to) {
	debug && console.log('moveTab', ...arguments);
	const tab = tabs.get(id); const move = query({ windowId: tab.windowId, });
	if (from < to) {
		move.forEach(tab => tab.index > from && tab.index <= to && tab.index--);
	} else {
		move.forEach(tab => tab.index < from && tab.index >= to && tab.index++);
	} tab.index = to;
}


// moved to window (from other window)
listen(Tabs.onAttached, function (id, { newWindowId, newPosition: newIndex, }) {
	debug && console.log('onAttached', ...arguments);
	const tab = tabs.get(id); const { windowId: oldWindowId, index: oldIndex, } = tab;
	query({ windowId: oldWindowId, }).forEach(tab => tab.index >  oldIndex && tab.index--);
	query({ windowId: newWindowId, }).forEach(tab => tab.index >= newIndex && tab.index++);
	tab.windowId = newWindowId; tab.index = newIndex;
});


// closed
listen(Tabs.onRemoved, function (id) { setTimeout(() => {
	debug && console.log('onRemoved', ...arguments);
	const { windowId, index, active, } = tabs.get(id); tabs.delete(id);
	query({ windowId, }).forEach(tab => tab.index > index && tab.index--);
	active && console.warn('removed active tab');
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


// helpers
function setProp(obj, key, value) {
	return Object.defineProperty(obj, key, { value, enumerable: true, configurable: true, writeable: true, });
}

}); })(this);
