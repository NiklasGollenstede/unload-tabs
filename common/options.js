(function(global) { 'use strict'; define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'node_modules/web-ext-utils/browser/': { manifest, },
	'node_modules/web-ext-utils/browser/storage': { sync: storage, },
	'node_modules/web-ext-utils/options/': Options,
}) => {
const isBeta = (/^\d+\.\d+.\d+(?!$)/).test((global.browser || global.chrome).runtime.getManifest().version); // version doesn't end after the 3rd number ==> bata channel

const model = {
	onClose: {
		title: 'Behavior on tab close',
		description: `When a tab is closed/unloaded, prefer to focus the loaded tab ...`,
		default: 'prev',
		restrict: { match: (/^(?:none|prev|left|right)$/), },
		input: { type: 'menulist', options: [
			{ value: 'prev',   label: `previously focused`, },
			{ value: 'right',  label: `to the right`, },
			{ value: 'left',   label: `to the left`, },
			{ value: 'none',   label: `that Firefox would focus, even if it is not loaded`, },
		], },
	},
	debug: {
		title: 'Debug Level',
		expanded: false,
		default: +isBeta,
		hidden: !isBeta,
		restrict: { type: 'number', from: 0, to: 2, },
		input: { type: 'integer', suffix: `set to > 0 to enable some diagnostic logging`, },
	},
};

return (await new Options({ model, storage, prefix: 'options', })).children;

}); })(this);
