(function(global) { 'use strict'; define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'node_modules/web-ext-utils/browser/storage': { sync: storage, },
	'node_modules/web-ext-utils/browser/version': { version, },
	'node_modules/web-ext-utils/options/': Options,
}) => {
const isBeta = (/^\d+\.\d+.\d+(?!$)/).test((global.browser || global.chrome).runtime.getManifest().version); // version doesn't end after the 3rd number ==> bata channel

const model = {
	onClose: {
		title: 'On Tab close',
		default: true,
		input: { type: 'boolean', suffix: `prevent Firefox from loading unloaded Tabs.`, },
		children: {
			previous: {
				default: false,
				input: { type: 'boolean', prefix: `Instead select<br>`, suffix: `the previous focused Tab,`, },
			},
			direction: {
				default: +1,
				restrict: { type: 'number', match: (/^[-]?1$/), },
				input: { type: 'menulist', options: [
					{ value: +1, label: `right`, },
					{ value: -1, label: `left`, },
				], prefix: `or the closest loaded Tab, prefering `, },
			},
			preemptive: {
				default: false,
				input: { type: 'menulist', options: [
					{ value: true, label: `always`, },
					{ value: false, label: `only if Firefox chooses a loaded Tab`, },
				], prefix: `Do that`, },
			},
		},
	},
	menus: {
		title: 'Menus',
		default: true,
		children: {
			unloadOtherTabs: {
				default: 'tab tools_menu',
				restrict: { type: 'string', },
				input: { type: 'menulist', prefix: `Show <b>Unload Other Tabs</b>`, options: [
					{ value: 'tools_menu', label: `only in the Tools menu`, },
					{ value: 'tab tools_menu', label: `also in the Tab context menu`, },
				], },
			},
			unloadAllTabs: {
				default: 'tools_menu',
				restrict: { type: 'string', },
				input: { type: 'menulist', prefix: `Show <b>Unload in All Windows</b>`, options: [
					{ value: 'tools_menu', label: `only in the Tools menu`, },
					{ value: 'tab tools_menu', label: `also in the Tab context menu`, },
				], },
			},
		},
	},
	commands: {
		title: 'Keyboards shortcuts',
		default: true,
		hidden: +(/\d+/).exec(version) < 60,
		children: {
			unloadSelectedTab: {
				description: `<b>Unload</b> the current Tab`,
				default: [ ],
				maxLength: 2,
				input: { type: 'command', default: 'Alt + W', },
			},
			prevLoadedTab: {
				description: `Switch to the <b>previous</b> loaded Tab`,
				default: 'Alt + PageUp',
				minLength: 1, maxLength: 2,
				input: { type: 'command', default: 'Alt + PageUp', },
			},
			nextLoadedTab: {
				description: `Switch to the <b>next</b> loaded Tab`,
				default: 'Alt + PageDown',
				minLength: 1, maxLength: 2,
				input: { type: 'command', default: 'Alt + PageDown', },
			},
		},
	},
	'intregrate.tst': {
		title: 'Integrate with Tree Style Tabs',
		description: `Only effective if Tree Style Tabs is already installed and activated.
		<br>Please re-enable if the integration fails.`,
		default: false,
		input: { type: 'boolean', suffix: `Dim unloaded Tabs and add context menu options.`, },
		children: {
			style: { hidden: true, default: `.tab.discarded { opacity: 0.6; }`, },
		},
	},
	debug: {
		title: 'Debug log verbosity',
		expanded: false,
		default: +isBeta,
	//	hidden: !isBeta,
		restrict: { type: 'number', from: 0, to: 3, match: { exp: /^\d$/, message: 'This value must be an integer', }, },
		input: { type: 'number', suffix: `Set 0 to disable, 1 for some, 2 for a lot of diagnostic logging. 3 is just ridiculous.`, },
	},
};

return (await new Options({ model, storage, prefix: 'options', })).children;

}); })(this);
