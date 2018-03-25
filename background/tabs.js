(function(global) { 'use strict'; define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'node_modules/web-ext-utils/browser/': { Tabs, },
	module,
}) => { /* global setTimeout, */

/**
 * Synchronous cache for Tabs.get/.query()
 */

const tabs = module.exports = new Map/*<id,{ id, discarded, active, opener, windowId, index, pinned, }>*/;

// initialize
Tabs.query({ }).then(_=>_.forEach(addTab));
function addTab({ id, discarded, active, opener, windowId, index, pinned, }) {
	tabs.set(id, { id, discarded, active, opener, windowId, index, pinned, __proto__: null, });
	tabs.query({ windowId, }).forEach(tab => tab.index > index && tab.index++);
	console.log('addTab', id, tabs.get(id));
}

// add and basic update
Tabs.onCreated.addListener(props => updateTab(props));
Tabs.onUpdated.addListener((id, change, props) => updateTab(props, change));
function updateTab(props, change = props) {
	const tab = tabs.get(props.id); if (tab) {
		if (('index' in change) && tab.index !== change.index) { moveTab(tab.id, tab.index, change.index); }
		Object.entries(change).forEach(([ key, value, ]) => (key in tab) && (tab[key] = value));
		console.log('updateTab', props.id, change, tab);
	} else { addTab(props); }
}

// activate (focus)
Tabs.onActivated.addListener(function ({ tabId, windowId, }) {
	console.log('onActivated', ...arguments);
	tabs.find({ windowId, active: true, }).active = false; // old in same window
	tabs.get(tabId).active = true;
});

// move within window
Tabs.onMoved.addListener((id, { fromIndex: from, toIndex: to, }) => moveTab(id, fromIndex, toIndex));
function moveTab(id, from, to) {
	console.log('moveTab', ...arguments);
	const tab = tabs.get(id); const move = tabs.query({ windowId: tab.windowId, });
	if (from < to) {
		move.forEach(tab => tab.index > from && tab.index <= to && tab.index--);
	} else {
		move.forEach(tab => tab.index < from && tab.index >= to && tab.index++);
	} tab.index = to;
}

// moved to window (from other window)
Tabs.onAttached.addListener(function (id, { newWindowId, newPosition: newIndex, }) {
	console.log('onAttached', ...arguments);
	const tab = tabs.get(id); const { windowId: oldWindowId, index: oldIndex, } = tab;
	tabs.query({ windowId: oldWindowId, }).forEach(tab => tab.index >  oldIndex && tab.index--);
	tabs.query({ windowId: newWindowId, }).forEach(tab => tab.index >= newIndex && tab.index++);
	tab.windowId = newWindowId; tab.index = newIndex;
});

// closed
Tabs.onRemoved.addListener(function (id) { setTimeout(() => {
	console.log('onRemoved', ...arguments);
	const { windowId, index, } = tabs.get(id); tabs.delete(id);
	tabs.query({ windowId, }).forEach(tab => tab.index > index && tab.index--);
}); });

// get the first or all tabs that match the criteria
function query(one, query) {
	query = Object.entries(query);
	const res = [ ]; for (const [ , tab, ] of tabs) {
		if (query.every(([ key, value, ]) => value !== undefined && tab[key] === value)) {
			if (one) { return tab; } else { res.push(tab); }
		}
	} return one ? null : res;
}

// get all matching
tabs.query = function(props) { return query(false, props); }
// get first matching (or null)
tabs.find  = function(props) { return query(true,  props); }

}); })(this);
