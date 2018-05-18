
# Unload Tabs <sub><a href="https://addons.mozilla.org/firefox/addon/unload-tabs/"><img src="./images/get-ff-ext.png" width="86" height="30" style="vertical-align:middle"></a><sub>

## Description
<!-- this HTML can be copied as the AMO description -->

<strong>Features:</strong>
<ul>
	<li> adds a context menu entry to <ul>
		<li> unload the current loaded tab </li>
		<li> unload all but the current tab </li>
	</ul></li>
	<li> avoids loading tabs when the active tab is closed (see the installation notice for details) </li>
	<li> adds shortcuts to jump to the next/previous <b>loaded</b> tab <ul>
		<li> the shortcut can be changed (in Firefox 60+) </li>
	</ul></li>
	<li> compatible with <ul>
		<li> Tree Style Tab: adds context menus and styles to the sidebar (see options) </li>
		<li> Container Tabs: unloaded tabs stay in the correct container </li>
		<li> Hidden Tabs (e.g. Tab Groups): works only on currently visible tabs </li>
	</ul></li>
	<li> makes clear which tabs are loaded by graying out unloaded tabs<ul>
		<li> this currently requires manual setup, see the installation notice </li>
	</ul></li>
	<li> can be removed without leaving anything behind or closing unloaded tabs --> just try it </li>
</ul>

<b>BUGS</b>:
Firefox currently suffers from a number of bugs related to unloading tabs. Most notably, tabs may <a href="https://bugzilla.mozilla.org/show_bug.cgi?id=1450382">loose their icons</a> or <a href="https://bugzilla.mozilla.org/show_bug.cgi?id=1450371">display as loading</a>. Fixing that is Mozillas job.
If you encounter any <b>other</b> problems, please report them as an <a href="https://github.com/NiklasGollenstede/unload-tabs/issues">issue</a> or comment on an existing issue matching your problem. Please don't complain in a rating on the Add-ons download page. I can't respond to those.

<b>Permissions used</b>:<ul>
	<li> <b>Display notifications</b>: Only to report errors </li>
	<li> <b>Access browser tabs</b>: This should be pretty obvious </li>
</ul>


## Development builds -- ![](https://ci.appveyor.com/api/projects/status/github/NiklasGollenstede/unload-tabs?svg=true)

Development builds are automatically created on every commit with [appveyor](https://ci.appveyor.com/project/NiklasGollenstede/unload-tabs/history) and published as [release](https://github.com/NiklasGollenstede/epub-creator/releases) on GitHub.\
These build use a different id (`-dev` suffix), so they are installed as additional extension and do not replace the release version. This means that:
 * you probably want to disable the release version, while the development version is active
 * any options set are managed individually (which also means that pre-release versions can't mess with your settings)
 * they never update to release versions, but
    * they update themselves to the latest development version
    * every release version has a corresponding development version (the one with the same prefix and highest build number)
