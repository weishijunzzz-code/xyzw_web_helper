#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
mode="${1:-simulator}"
case "$mode" in
  simulator|ipa|unsigned-ipa) ;;
  *) echo "Usage: bash ios/build.sh [simulator|ipa|unsigned-ipa]" >&2; exit 2 ;;
esac

if [[ "$(uname -s)" != Darwin ]] || ! command -v xcodebuild >/dev/null; then
  echo "iOS builds require macOS and Xcode 26 or later." >&2
  exit 1
fi
xcode_version="$(xcodebuild -version | awk 'NR == 1 { print $2 }')"
if [[ ! "$xcode_version" =~ ^[0-9]+(\.[0-9]+)*$ || "${xcode_version%%.*}" -lt 26 ]]; then
  echo "Select Xcode 26 or later using xcode-select." >&2
  exit 1
fi

if [[ "$mode" == ipa && ! "${IOS_TEAM_ID:-}" =~ ^[A-Z0-9]{10}$ ]]; then
  echo "Set IOS_TEAM_ID to the Apple Developer team that registered the target iPhone." >&2
  exit 2
fi
if [[ -n "${IOS_BUNDLE_ID:-}" && ! "$IOS_BUNDLE_ID" =~ ^[A-Za-z0-9.-]+$ ]]; then
  echo "IOS_BUNDLE_ID must be an Apple bundle identifier." >&2
  exit 2
fi

if [[ ! -d node_modules/@capacitor/ios ]]; then
  pnpm install --frozen-lockfile
fi
npm run build:ios

output="${IOS_OUTPUT_DIR:-$PWD/.cache/ios-build}"
mkdir -p "$output"
output="$(cd "$output" && pwd)"
args=(-project ios/App/App.xcodeproj -scheme App -derivedDataPath "$output/DerivedData")
if [[ -n "${IOS_BUNDLE_ID:-}" ]]; then args+=("PRODUCT_BUNDLE_IDENTIFIER=$IOS_BUNDLE_ID"); fi

if [[ "$mode" == simulator ]]; then
  xcodebuild "${args[@]}" -configuration Debug -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
  printf 'Simulator app: %s\n' "$output/DerivedData/Build/Products/Debug-iphonesimulator/App.app"
  exit 0
fi

archive="$output/App-$(date +%Y%m%d-%H%M%S).xcarchive"
if [[ "$mode" == unsigned-ipa ]]; then
  xcodebuild "${args[@]}" -configuration Release -destination 'generic/platform=iOS' \
    CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY= \
    -archivePath "$archive" archive

  app="$archive/Products/Applications/App.app"
  if [[ ! -f "$app/App" || ! -f "$app/Info.plist" || ! -f "$app/public/index.html" ]]; then
    echo "Device archive is missing the app binary, Info.plist or web assets." >&2
    exit 1
  fi

  staging="$(mktemp -d "$output/.unsigned-ipa.XXXXXX")"
  trap 'rm -rf -- "$staging"' EXIT
  mkdir "$staging/Payload"
  ditto "$app" "$staging/Payload/App.app"
  ipa_name="$(basename "$archive" .xcarchive)-unsigned.ipa"
  ditto -c -k --keepParent "$staging/Payload" "$staging/$ipa_name"
  unzip -tq "$staging/$ipa_name"
  mv "$staging/$ipa_name" "$output/$ipa_name"
  printf 'Unsigned device IPA: %s\n' "$output/$ipa_name"
  exit 0
fi

xcodebuild "${args[@]}" -configuration Release -destination 'generic/platform=iOS' \
  -allowProvisioningUpdates "DEVELOPMENT_TEAM=$IOS_TEAM_ID" -archivePath "$archive" archive

export_options="$(mktemp "${TMPDIR:-/tmp}/xyzw-ipa.XXXXXX")"
trap 'rm -f "$export_options"' EXIT
cat > "$export_options" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>release-testing</string>
  <key>destination</key><string>export</string>
  <key>signingStyle</key><string>automatic</string>
  <key>teamID</key><string>$IOS_TEAM_ID</string>
</dict>
</plist>
EOF
export_path="$output/$(basename "$archive" .xcarchive)"
xcodebuild -exportArchive -archivePath "$archive" -exportOptionsPlist "$export_options" \
  -exportPath "$export_path" -allowProvisioningUpdates
shopt -s nullglob
ipa_files=("$export_path"/*.ipa)
if [[ ! -f "${ipa_files[0]:-}" || -n "${ipa_files[1]:-}" ]]; then
  echo "Expected one exported IPA in $export_path." >&2
  exit 1
fi
printf 'Registered-device IPA: %s\n' "${ipa_files[0]}"
