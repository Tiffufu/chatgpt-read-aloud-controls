<!-- Copy this file into the GitHub release description; it is not applied
automatically. Replace every {{...}} placeholder and remove this comment before
publishing. VERSION is the manifest version without the leading v. Check the
download and documentation links against the release tag. Keep the installation
and update instructions in patch releases too. -->

## Install

Download **[chatgpt-read-aloud-controls-unpacked.zip](https://github.com/Tiffufu/chatgpt-read-aloud-controls/releases/download/v{{VERSION}}/chatgpt-read-aloud-controls-unpacked.zip)** from Assets below.

1. Extract the ZIP and keep the `chatgpt-read-aloud-controls` folder in a permanent location.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Click **Load unpacked** and choose that folder (the one containing `manifest.json`).
4. Refresh ChatGPT and start **Read Aloud** on a response.

The attached ZIP contains the extension, install instructions, privacy statement,
and license notices. GitHub's automatically generated **Source code** archives
contain the development repository instead.

See the **[full installation guide](https://github.com/Tiffufu/chatgpt-read-aloud-controls/blob/v{{VERSION}}/INSTALL.md)** for this release.

## Update

Unpacked installations update manually. Download and extract this release's ZIP,
replace the files in the same permanent extension folder, click **Reload** on the
extension card at `chrome://extensions`, and refresh your ChatGPT tabs.
Downloading a new ZIP alone does not update an existing installation.

## Changes

{{CHANGES: describe user-facing changes and any compatibility or migration notes.}}

## Verification

{{VERIFICATION: report checks actually completed for this release and any gaps.
Distinguish automated tests, browser fixtures, live ChatGPT checks, and a separate
unpacked installation from the extracted release ZIP. Do not copy old results.}}

See the [changelog](https://github.com/Tiffufu/chatgpt-read-aloud-controls/blob/v{{VERSION}}/CHANGELOG.md) for details.
