/**
 * Ad-hoc code signing hook for electron-builder.
 *
 * Why: Without a code signature, macOS identifies the app by inode/path.
 * Every `rm -rf && cp -R` changes inodes → macOS sees a "new" app →
 * resets Accessibility permission → user gets the prompt again.
 *
 * Ad-hoc signing (`codesign -s -`) gives the app a stable cdhash based
 * on binary content. No Apple Developer account required.
 * If the binary doesn't change between builds, the signature is stable
 * → Accessibility permission persists across reinstalls.
 *
 * Runs after electron-builder packs the .app, before DMG creation.
 */
const { execSync } = require('child_process')
const { join } = require('path')

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return

  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)

  console.log('[afterPack] Ad-hoc signing:', appPath)

  // 1. Remove resource forks / extended attributes (codesign refuses otherwise)
  // 2. Ad-hoc sign: --force (overwrite), --deep (nested code), - (ad-hoc)
  try {
    execSync(`xattr -cr "${appPath}"`, { stdio: 'inherit' })
    execSync(`codesign --force --deep --sign - "${appPath}"`, {
      stdio: 'inherit'
    })
    console.log('[afterPack] Ad-hoc signing complete ✓')
  } catch (err) {
    console.error('[afterPack] Ad-hoc signing failed:', err.message)
    throw err
  }
}
