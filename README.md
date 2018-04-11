
# Unload Tabs

## Description
<!-- this HTML can be copied as the AMO description -->

<strong>Features:</strong>
<ul>
	<li> adds a context menu entry to <ul>
		<li> unload the current loaded tab </li>
		<li> unload all but the current tab </li>
	</ul></li>
	<li> makes clear which tabs are loaded by graying out unloaded tabs<ul>
		<li> the highlight style can be changed </li>
	</ul></li>
	<li> avoids loading tabs when the active tab is closed </li>
	<li> adds shortcuts to jump to the next/previous <b>loaded</b> tab <ul>
		<li> the shortcut can be changed (currently requires you to disable/re-enable the add-on) </li>
	</ul></li>
	<li> compatible with <ul>
		<li> Tree Style Tab: adds context menus and styles to the sidebar </li>
		<li> Container Tabs: unloaded tabs stay in the correct container </li>
		<li> Hidden Tabs (e.g. Tab Groups): works only on currently visible tabs </li>
	</ul></li>
	<li> can be removed without leaving anything behind or closing unloaded tabs --> just try it </li>
</ul>


## Development builds -- ![](https://ci.appveyor.com/api/projects/status/github/NiklasGollenstede/unload-tabs?svg=true)

Development builds are automatically created on every commit with [appveyor](https://ci.appveyor.com/project/NiklasGollenstede/unload-tabs/history) and published as [release](https://github.com/NiklasGollenstede/unload-tabs/releases) on GitHub.\
These build use a different id (`-dev` suffix), so they can / have to be installed parallel to the release versions from AMO; only keep one version installed and active.\
Dev versions therefore never update to release versions, but they use the browsers build-in update mechanism to automatically update to the latest dev release. Every release version corresponds to the dev version with the same version prefix and the highest build number.
