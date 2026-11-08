set -euo pipefail
mkdir -p compiled/native
xcrun clang -fobjc-arc -fvisibility=hidden -Os -framework Foundation -framework CoreServices src/native/dictionary.m -o compiled/native/linloop-dictionary
