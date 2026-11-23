set -euo pipefail
mkdir -p compiled/native
xcrun clang -fobjc-arc -fvisibility=hidden -Os -framework Foundation -framework CoreServices -framework NaturalLanguage src/native/dictionary.m -o compiled/native/linloop-dictionary
