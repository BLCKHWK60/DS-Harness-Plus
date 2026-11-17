// hid-capture: print raw HID input reports from keyboards, mice and other
// Generic Desktop devices, one JSON object per line, then exit.
//
// Build:
//   mkdir -p ~/.dsh/bench/bin
//   swiftc -O "<this file>" -o ~/.dsh/bench/bin/hid-capture -framework IOKit -framework Foundation
//
// Run:
//   ~/.dsh/bench/bin/hid-capture 5     (seconds)
//
// macOS asks for "Input Monitoring" permission: System Settings → Privacy &
// Security → Input Monitoring → add DeepSeek Harness, then run it again.
import Foundation
import IOKit.hid

let requested = Double(CommandLine.arguments.dropFirst().first ?? "5") ?? 5
let duration = max(1.0, min(60.0, requested))

let manager = IOHIDManagerCreate(kCFAllocatorDefault, IOOptionBits(kIOHIDOptionsTypeNone))
let matching = [kIOHIDDeviceUsagePageKey: kHIDPage_GenericDesktop] as CFDictionary
IOHIDManagerSetDeviceMatching(manager, matching)

IOHIDManagerRegisterInputValueCallback(manager, { _, _, _, value in
    let element = IOHIDValueGetElement(value)
    let page = IOHIDElementGetUsagePage(element)
    let usage = IOHIDElementGetUsage(element)
    let intValue = IOHIDValueGetIntegerValue(value)
    print("{\"page\":\(page),\"usage\":\(usage),\"value\":\(intValue)}")
    fflush(stdout)
}, nil)

IOHIDManagerScheduleWithRunLoop(manager, CFRunLoopGetCurrent(), CFRunLoopMode.defaultMode.rawValue)
let openStatus = IOHIDManagerOpen(manager, IOOptionBits(kIOHIDOptionsTypeNone))
if openStatus != kIOReturnSuccess {
    FileHandle.standardError.write("cannot open the HID manager (status \(openStatus)). Grant Input Monitoring to DeepSeek Harness.\n".data(using: .utf8)!)
    exit(2)
}

RunLoop.current.run(until: Date().addingTimeInterval(duration))
IOHIDManagerClose(manager, IOOptionBits(kIOHIDOptionsTypeNone))
