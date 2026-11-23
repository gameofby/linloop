#import <Foundation/Foundation.h>
#import <CoreServices/CoreServices.h>
#import <NaturalLanguage/NaturalLanguage.h>

extern CFSetRef DCSCopyAvailableDictionaries(void);
extern CFStringRef DCSDictionaryGetName(CFTypeRef dictionary);
extern CFArrayRef DCSCopyRecordsForSearchString(CFTypeRef dictionary, CFStringRef query,
                                                 CFIndex method, CFIndex maximumResults);
extern CFStringRef DCSRecordCopyData(CFTypeRef record);

static NSString *DictionaryName(id dictionary) {
  CFStringRef name = DCSDictionaryGetName((__bridge CFTypeRef)dictionary);
  return name ? (__bridge NSString *)name : @"";
}

static int ReturnDictionaryFailure(NSString *message) {
  NSDictionary *error = @{@"error": message ?: @"Dictionary lookup failed.", @"notFound": @YES};
  NSData *data = [NSJSONSerialization dataWithJSONObject:error options:0 error:nil];
  fwrite(data.bytes, 1, data.length, stdout);
  fputc('\n', stdout);
  return 2;
}

int main(int argc, char *argv[]) {
  @autoreleasepool {
    if ([NSProcessInfo.processInfo.environment[@"LINLOOP_DICTIONARY_DUMP"] isEqualToString:@"1"]) {
      NSSet *available = (__bridge_transfer NSSet *)DCSCopyAvailableDictionaries();
      NSMutableArray *names = [NSMutableArray array];
      for (id dictionary in available) [names addObject:DictionaryName(dictionary)];
      NSData *data = [NSJSONSerialization dataWithJSONObject:names options:NSJSONWritingSortedKeys error:nil];
      fwrite(data.bytes, 1, data.length, stdout);
      fputc('\n', stdout);
      return 0;
    }
    if (argc == 3 && strcmp(argv[1], "--language") == 0) {
      NLLanguageRecognizer *recognizer = [[NLLanguageRecognizer alloc] init];
      recognizer.languageConstraints = @[NLLanguageEnglish, NLLanguageFrench];
      [recognizer processString:[NSString stringWithUTF8String:argv[2]]];
      puts([recognizer.dominantLanguage isEqualToString:NLLanguageFrench] ? "fr" : "en");
      return 0;
    }
    if (argc != 2) return 1;

    NSString *query = [[NSString stringWithUTF8String:argv[1]]
      stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
    if (!query.length) return ReturnDictionaryFailure(@"Type a word or phrase first.");
    if (query.length > 200) return ReturnDictionaryFailure(@"Dictionary lookup supports up to 200 characters.");

    NSArray *preferred = @[@"牛津英汉汉英词典", @"New Oxford American Dictionary", @"Oxford Dictionary of English"];
    NSSet *available = (__bridge_transfer NSSet *)DCSCopyAvailableDictionaries();
    NSArray *records = nil;
    NSString *source = @"";

    for (NSString *want in preferred) {
      for (id dictionary in available) {
        if (![DictionaryName(dictionary) isEqualToString:want]) continue;
        CFArrayRef found = DCSCopyRecordsForSearchString((__bridge CFTypeRef)dictionary,
                                                           (__bridge CFStringRef)query, 0, 1);
        if (found && CFArrayGetCount(found)) {
          records = (__bridge_transfer NSArray *)found;
          source = want;
          break;
        }
        if (found) CFRelease(found);
      }
      if (records) break;
    }
    if (!records.count) return ReturnDictionaryFailure(@"No macOS dictionary entry found.");

    CFStringRef copied = DCSRecordCopyData((__bridge CFTypeRef)records.firstObject);
    if (!copied) return ReturnDictionaryFailure(@"macOS Dictionary returned an empty entry.");
    NSString *xml = (__bridge_transfer NSString *)copied;
    NSDictionary *payload = @{@"source": source, @"xml": xml};
    NSData *data = [NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];
    fwrite(data.bytes, 1, data.length, stdout);
    fputc('\n', stdout);
  }
  return 0;
}
