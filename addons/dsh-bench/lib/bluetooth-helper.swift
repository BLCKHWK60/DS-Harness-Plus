// DeepSeek Harness Bench: a small Bluetooth reader (plan B9). Compiled on this Mac on first use.
//
//   bench-bluetooth scan <seconds>        nearby devices that advertise: id, name, signal, services
//   bench-bluetooth read <id> <seconds>   one device's standard services: battery level and device information
//
// It only reads. It never writes a characteristic, never subscribes, never pairs. It prints one JSON
// object and ends within the given time.
import CoreBluetooth
import Foundation

let BATTERY = CBUUID(string: "180F")
let DEVICE_INFO = CBUUID(string: "180A")
/// The characteristics read, and the names they are printed under.
let READ: [CBUUID: String] = [
  CBUUID(string: "2A19"): "battery",
  CBUUID(string: "2A29"): "maker",
  CBUUID(string: "2A24"): "model",
  CBUUID(string: "2A25"): "serial",
  CBUUID(string: "2A26"): "firmware",
  CBUUID(string: "2A27"): "hardware",
  CBUUID(string: "2A28"): "software",
]

final class Reader: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
  let mode: String
  let target: UUID?
  var central: CBCentralManager!
  var found: [String: [String: Any]] = [:]
  var peripheral: CBPeripheral?
  var values: [String: Any] = [:]
  var pending = 0
  var finished = false

  init(mode: String, target: UUID?, seconds: Double) {
    self.mode = mode
    self.target = target
    super.init()
    central = CBCentralManager(delegate: self, queue: nil)
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { self.finish(error: nil) }
  }

  func finish(error: String?) {
    if finished { return }
    finished = true
    central.stopScan()
    if let p = peripheral { central.cancelPeripheralConnection(p) }
    var out: [String: Any] = [:]
    if mode == "scan" { out["devices"] = Array(found.values) } else { out["values"] = values }
    if let error = error { out["error"] = error }
    if let data = try? JSONSerialization.data(withJSONObject: out, options: []), let text = String(data: data, encoding: .utf8) { print(text) }
    exit(0)
  }

  func centralManagerDidUpdateState(_ c: CBCentralManager) {
    switch c.state {
    case .poweredOn:
      if mode == "scan" {
        c.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
      } else if let target = target {
        if let p = c.retrievePeripherals(withIdentifiers: [target]).first { open(p) } else { c.scanForPeripherals(withServices: nil, options: nil) }
      }
    case .unauthorized: finish(error: "unauthorized")
    case .poweredOff: finish(error: "off")
    case .unsupported: finish(error: "unsupported")
    default: break
    }
  }

  func centralManager(_ c: CBCentralManager, didDiscover p: CBPeripheral, advertisementData ad: [String: Any], rssi: NSNumber) {
    if mode == "scan" {
      let services = (ad[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID])?.map { $0.uuidString } ?? []
      let name = p.name ?? (ad[CBAdvertisementDataLocalNameKey] as? String) ?? ""
      let maker = (ad[CBAdvertisementDataManufacturerDataKey] as? Data).map { $0.prefix(2).map { String(format: "%02x", $0) }.joined() } ?? ""
      found[p.identifier.uuidString] = ["id": p.identifier.uuidString, "name": name, "rssi": rssi.intValue, "services": services, "maker": maker, "connectable": (ad[CBAdvertisementDataIsConnectable] as? NSNumber)?.boolValue ?? false]
    } else if p.identifier == target {
      c.stopScan()
      open(p)
    }
  }

  func open(_ p: CBPeripheral) {
    peripheral = p
    p.delegate = self
    values["name"] = p.name ?? ""
    central.connect(p, options: nil)
  }

  func centralManager(_ c: CBCentralManager, didConnect p: CBPeripheral) { p.discoverServices([BATTERY, DEVICE_INFO]) }
  func centralManager(_ c: CBCentralManager, didFailToConnect p: CBPeripheral, error: Error?) { finish(error: "could not connect") }

  func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
    let services = (p.services ?? []).filter { $0.uuid == BATTERY || $0.uuid == DEVICE_INFO }
    values["services"] = services.map { $0.uuid.uuidString }
    if services.isEmpty { finish(error: nil); return }
    pending = services.count
    for s in services { p.discoverCharacteristics(Array(READ.keys), for: s) }
  }

  func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor s: CBService, error: Error?) {
    pending -= 1
    for ch in s.characteristics ?? [] where READ[ch.uuid] != nil && ch.properties.contains(.read) {
      pending += 1
      p.readValue(for: ch)
    }
    if pending <= 0 { finish(error: nil) }
  }

  func peripheral(_ p: CBPeripheral, didUpdateValueFor ch: CBCharacteristic, error: Error?) {
    if let name = READ[ch.uuid], let data = ch.value {
      if name == "battery" { values[name] = data.first.map { Int($0) } ?? -1 } else { values[name] = String(decoding: data.prefix(64), as: UTF8.self) }
    }
    pending -= 1
    if pending <= 0 { finish(error: nil) }
  }
}

let args = CommandLine.arguments
guard args.count >= 3, ["scan", "read"].contains(args[1]), args[1] == "scan" || args.count >= 4 else {
  print("{\"error\":\"usage\"}")
  exit(2)
}
let mode = args[1]
let target = mode == "read" ? UUID(uuidString: args[2]) : nil
if mode == "read" && target == nil {
  print("{\"error\":\"not an id\"}")
  exit(2)
}
let seconds = min(30.0, max(2.0, Double(args[mode == "read" ? 3 : 2]) ?? 8.0))
let reader = Reader(mode: mode, target: target, seconds: seconds)
_ = reader
RunLoop.main.run()
