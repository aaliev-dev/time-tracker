/**
 * Code signing hook for electron-builder.
 *
 * Why: macOS TCC (Accessibility, Screen Recording permissions) is tied to
 * the app's code signature. Ad-hoc signing (codesign -s -) produces a cdhash
 * that changes every rebuild → macOS treats it as a "new" app → resets
 * permissions on every reinstall or reboot.
 *
 * Solution: sign with a self-signed certificate ("AliSwitcher Code Signing")
 * from the login keychain. The certificate's CN/O stay stable across rebuilds,
 * so macOS TCC tracks the app by certificate identity, not by cdhash.
 * Accessibility permission persists across reinstalls and reboots.
 *
 * No Apple Developer account required — self-signed certificates work for
 * TCC stability on the same machine where the certificate is trusted.
 *
 * Runs after electron-builder packs the .app, before DMG creation.
 */
const { execSync } = require('child_process')
const { join } = require('path')

const SIGNING_IDENTITY = 'AliSwitcher Code Signing'

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return

  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)

  console.log('[afterPack] Certificate signing:', appPath)

  // 1. Remove resource forks / extended attributes from ALL files in the bundle
  //    (codesign refuses to sign apps with xattr on any nested file)
  // 2. Sign with self-signed certificate: --force (overwrite), --deep (nested)
  try {
    execSync(`xattr -cr "${appPath}"`, { stdio: 'inherit' })
    // Also clear xattr on all contents recursively (belt and suspenders)
    execSync(`find "${appPath}" -exec xattr -c {} + 2>/dev/null || true`, { stdio: 'inherit' })
    execSync(`codesign --force --deep --sign "${SIGNING_IDENTITY}" "${appPath}"`, {
      stdio: 'inherit'
    })
    console.log('[afterPack] Certificate signing complete ✓')
  } catch (err) {
    console.error('[afterPack] Certificate signing failed:', err.message)
    // Fallback: ad-hoc signing (no stable TCC, but app still runs)
    console.warn('[afterPack] Falling back to ad-hoc signing')
    execSync(`xattr -cr "${appPath}"`, { stdio: 'inherit' })
    execSync(`find "${appPath}" -exec xattr -c {} + 2>/dev/null || true`, { stdio: 'inherit' })
    execSync(`codesign --force --deep --sign - "${appPath}"`, {
      stdio: 'inherit'
    })
    console.log('[afterPack] Ad-hoc fallback signing complete ✓')
  }
}
