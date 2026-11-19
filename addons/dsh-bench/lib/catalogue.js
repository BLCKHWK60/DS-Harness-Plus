/**
 * The catalogue (plan B10): the 22 families of device people commonly have at home, each with how Bench
 * recognises it, its doors, the deepest level it can reach, the open tools of its route, and what Bench
 * has built for it so far. Every family has Identify and Read through Bench's doors (USB listing, serial
 * watch, the Bluetooth list and standard services, what announces itself on a marked network). Adjust
 * and Write exist only where a recipe is built (ESP32 boards, Android, GL.iNet/OpenWrt routers, the
 * Windows server); the others are added family by family when the owner asks.
 *
 * Some settings are never changed in any recipe: radio limits (transmit power, country or region,
 * frequency and channel width) and a drone's failsafes. NEVER_KEYS names them; every recipe that changes
 * a setting checks it.
 */

/** Settings no recipe ever changes, whatever is asked. */
export const NEVER_KEYS = /(tx_?power|transmit|country|region|regdomain|reg_domain|frequenc|freq_|channel_?width|chanbw|htmode|failsafe|fail_safe|return_?to_?home|rth_|geofence|geo_fence|speed_?limit|max_?speed|rf_?power|power_?level)/i;
/** @returns {string} why a setting is never changed, or ''. */
export const neverChanged = (key) => (NEVER_KEYS.test(String(key ?? '')) ? `${String(key).slice(0, 80)} is a radio limit or a safety setting (transmit power, region, frequency, a drone's failsafe, a speed limit); Devices never changes it on any device.` : '');

const built = (levels) => levels;
/** The families, in the plan's order. */
export const FAMILIES = [
  { id: 'maker-boards', name: 'Maker boards', kinds: 'ESP32 and ESP8266, Arduino, Raspberry Pi Pico, STM32, nRF52, micro:bit, Teensy', doors: ['usb'], deepest: 'Write', route: 'esptool, arduino-cli, picotool, dfu-util, probe-rs', built: built(['identify', 'read', 'write (ESP32 with esptool)']), usb: [0x10c4, 0x1a86, 0x0403, 0x067b, 0x303a, 0x2341, 0x2a03, 0x1b4f, 0x2e8a, 0x0483, 0x1915, 0x0d28, 0x16c0, 0x239a], words: /\b(esp32|esp8266|arduino|pico|rp2040|rp2350|stm32|nrf52|micro:?bit|teensy|nodemcu|wemos|d1 mini|feather)\b/i },
  { id: 'small-computers', name: 'Small computers', kinds: 'Raspberry Pi and similar boards, mini PCs', doors: ['network'], deepest: 'Write, as a new system image', route: 'OpenSSH, Raspberry Pi Imager', built: built(['identify']), mdns: ['_workstation._tcp', '_ssh._tcp'], words: /\b(raspberry ?pi|raspberrypi|orange ?pi|odroid|rock ?pi|mini ?pc|nuc)\b/i },
  { id: 'keyboards-input', name: 'Keyboards and input', kinds: 'keyboards with QMK or ZMK, macro pads, mice, game controllers', doors: ['usb', 'bluetooth'], deepest: 'Write for QMK and ZMK; others Adjust through the maker\'s tool', route: 'QMK, ZMK', built: built(['identify', 'read (Bluetooth standard services)']), words: /\b(keyboard|keypad|macro ?pad|mouse|trackpad|controller|gamepad|qmk|zmk)\b/i, ble: ['1812'] },
  { id: 'routers-wifi', name: 'Routers and Wi-Fi', kinds: 'GL.iNet routers, OpenWrt routers, mesh systems, access points, the internet provider\'s router', doors: ['network'], deepest: 'Write where the maker or OpenWrt offers firmware; a provider\'s router: Adjust', route: 'OpenWrt, the router\'s own interface', built: built(['identify', 'read', 'adjust', 'write (GL.iNet and OpenWrt, by sysupgrade)']), mdns: ['_http._tcp', '_ssh._tcp'], words: /\b(gl[.-]?inet|gl-[a-z]{2}\d+|slate|openwrt|router|fritz!?box|access point|mesh|unifi|eero|orbi|deco)\b/i },
  { id: 'network-storage', name: 'Network gear and storage', kinds: 'managed switches, NAS boxes, home servers, power backup units', doors: ['network'], deepest: 'Adjust; Write only as the maker\'s update', route: 'OpenSSH, Network UPS Tools', built: built(['identify', 'read and adjust (a Windows server)']), mdns: ['_smb._tcp', '_device-info._tcp'], words: /\b(nas|synology|qnap|truenas|unraid|lincstation|switch|ups)\b/i },
  { id: 'computers', name: 'Computers', kinds: 'Macs, Windows PCs, Linux PCs, Chromebooks', doors: ['network'], deepest: 'Adjust; firmware only through the maker\'s updater', route: 'OpenSSH, PowerShell remoting', built: built(['identify', 'read', 'adjust (Windows over SSH)']), mdns: ['_workstation._tcp', '_ssh._tcp', '_smb._tcp'], words: /\b(windows|macbook|imac|mac mini|linux|ubuntu|chromebook|pc)\b/i },
  { id: 'android', name: 'Android devices', kinds: 'phones, tablets, TV boxes and sticks, e-readers that run Android', doors: ['usb', 'network'], deepest: 'Adjust; Write only where the maker lets the bootloader be unlocked', route: 'Android platform-tools (adb, fastboot)', built: built(['identify', 'read', 'adjust (settings with undo)', 'write (unlock and factory image, behind their own yes)']), usb: [0x18d1, 0x04e8, 0x22b8, 0x2717, 0x12d1, 0x0bb4, 0x2a70, 0x1004], words: /\b(android|pixel|galaxy|oneplus|xiaomi|redmi|motorola|huawei|fire tv|shield)\b/i },
  { id: 'apple', name: 'Apple devices', kinds: 'iPhone, iPad, Apple Watch, AirPods, Apple TV, HomePod', doors: ['usb', 'bluetooth'], deepest: 'Read; updates through Apple only', route: 'Apple Configurator, libimobiledevice', built: built(['identify', 'read (the Mac\'s lists)']), usb: [0x05ac], mdns: ['_airplay._tcp', '_raop._tcp'], words: /\b(iphone|ipad|apple watch|airpods|apple tv|homepod)\b/i },
  { id: 'smart-home-devices', name: 'Smart plugs, lights and sensors', kinds: 'Wi-Fi plugs, bulbs and switches, Zigbee bulbs, buttons and sensors, Matter devices', doors: ['network', 'usb'], deepest: 'Write for devices that take ESPHome or Tasmota; others Adjust through their hub', route: 'ESPHome, Tasmota, Zigbee2MQTT', built: built(['identify', 'write (a first flash over USB with the ESP32 recipe)']), mdns: ['_esphomelib._tcp', '_hap._tcp', '_matter._tcp'], words: /\b(shelly|sonoff|tasmota|esphome|tuya|hue|ikea tradfri|smart plug|bulb|zigbee|matter)\b/i },
  { id: 'smart-home-hubs', name: 'Smart-home hubs', kinds: 'Home Assistant boxes, Zigbee and Thread sticks, light bridges, infrared senders', doors: ['network', 'usb'], deepest: 'Adjust; Write for the sticks', route: 'Home Assistant', built: built(['identify']), mdns: ['_home-assistant._tcp', '_hap._tcp'], words: /\b(home assistant|hass|conbee|skyconnect|zbt-1|sonoff zigbee|thread|hue bridge|broadlink)\b/i },
  { id: 'voice-speakers', name: 'Voice speakers and displays', kinds: 'Amazon Echo, Google Nest', doors: ['network'], deepest: 'Identify: they are closed', route: 'none', built: built(['identify']), mdns: ['_googlecast._tcp'], words: /\b(echo|alexa|nest (?:hub|mini|audio)|google home)\b/i },
  { id: 'cameras-home', name: 'Cameras for the home', kinds: 'network cameras, video doorbells, recorders, baby monitors, webcams', doors: ['network', 'usb'], deepest: 'Adjust for cameras that speak ONVIF; cloud-only cameras: Identify', route: 'ONVIF', built: built(['identify']), words: /\b(camera|cam|doorbell|nvr|baby monitor|webcam|reolink|hikvision|dahua|arlo|ring)\b/i },
  { id: 'tv-audio', name: 'TV and audio', kinds: 'smart TVs, streaming boxes, receivers, soundbars, network speakers, Bluetooth speakers and headphones', doors: ['network', 'bluetooth'], deepest: 'Adjust where the maker documents a local interface; otherwise Read', route: 'the maker\'s documented interface', built: built(['identify', 'read (Bluetooth standard services)']), mdns: ['_googlecast._tcp', '_airplay._tcp', '_raop._tcp', '_spotify-connect._tcp'], words: /\b(tv|bravia|soundbar|receiver|sonos|speaker|headphones|earbuds|jbl|bose|sennheiser)\b/i },
  { id: 'game-consoles', name: 'Game consoles', kinds: 'PlayStation, Xbox, Switch, Steam Deck', doors: ['network'], deepest: 'Identify; the Steam Deck is a Linux PC and reaches Adjust', route: 'OpenSSH for the Steam Deck', built: built(['identify']), words: /\b(playstation|ps[45]|xbox|switch|steam ?deck)\b/i },
  { id: 'printers-scanners', name: 'Printers and scanners', kinds: 'network printers, label printers, document scanners', doors: ['network', 'usb'], deepest: 'Adjust; firmware through the maker', route: 'the printer\'s own interface', built: built(['identify']), mdns: ['_ipp._tcp', '_printer._tcp', '_uscan._tcp'], words: /\b(printer|scanner|laserjet|deskjet|brother|epson|canon pixma|dymo|zebra)\b/i },
  { id: 'printers-3d-cnc', name: '3D printers, CNC and lasers', kinds: 'printers with Marlin or Klipper, CNC and laser machines with GRBL, closed printers', doors: ['usb', 'network'], deepest: 'Write for Marlin, Klipper and GRBL; closed makers: Adjust', route: 'Marlin, Klipper, GRBL', built: built(['identify', 'read (watching its serial port)']), mdns: ['_octoprint._tcp', '_moonraker._tcp'], words: /\b(prusa|creality|ender|bambu|voron|klipper|marlin|grbl|cnc|laser engraver|xtool)\b/i },
  { id: 'drones-rc', name: 'Drones and radio control', kinds: 'flight controllers with Betaflight or ArduPilot, radios with EdgeTX, ExpressLRS gear, DJI drones', doors: ['usb'], deepest: 'Write for the open ones; DJI: Read. Failsafes and radio limits are look-only', route: 'Betaflight, ArduPilot, EdgeTX, ExpressLRS', built: built(['identify', 'read (watching its serial port)']), usb: [0x2ca3], words: /\b(drone|quad|betaflight|ardupilot|pixhawk|edgetx|radiomaster|expresslrs|elrs|dji|flight controller)\b/i, never: 'failsafes, radio limits' },
  { id: 'cameras-photo', name: 'Photo and video cameras', kinds: 'action cameras, 360 cameras, mirrorless cameras, dashcams', doors: ['usb', 'bluetooth', 'network'], deepest: 'Adjust for settings on supported models; firmware through the maker', route: 'gPhoto, Open GoPro', built: built(['identify']), usb: [0x2672, 0x04a9, 0x04b0, 0x054c, 0x04cb], words: /\b(gopro|insta360|osmo|mirrorless|dslr|dashcam|sony alpha|canon eos|nikon|fujifilm)\b/i },
  { id: 'storage-usb', name: 'Storage and USB gear', kinds: 'drives, memory cards, docks and hubs, card readers, capture cards', doors: ['usb'], deepest: 'Read, including drive health; firmware through the maker', route: 'smartmontools', built: built(['identify']), words: /\b(ssd|hdd|drive|flash drive|card reader|dock|hub|capture card|samsung t7|sandisk|wd|seagate)\b/i },
  { id: 'wearables-health', name: 'Wearables and health', kinds: 'fitness bands, watches, heart-rate straps, scales, blood-pressure and glucose meters', doors: ['bluetooth'], deepest: 'Read of the standard services; medical devices are look-only', route: 'the standard Bluetooth services', built: built(['identify', 'read (Bluetooth standard services)']), ble: ['180D', '1810', '1808', '181D'], words: /\b(fitbit|garmin|polar|whoop|band|watch|heart rate|scale|oura)\b/i },
  { id: 'bikes-scooters-cars', name: 'Bikes, scooters and cars', kinds: 'e-bike systems, e-scooters, a car\'s diagnostic port, wallboxes, chargers and power banks', doors: ['bluetooth', 'usb'], deepest: 'Read. Look-only: no Adjust and no Write', route: 'python-OBD for a car\'s fault codes', built: built(['identify', 'read']), lookOnly: true, words: /\b(e-?bike|bosch|kiox|nyon|shimano steps|bafang|scooter|ninebot|segway|obd|wallbox|charger|power ?bank)\b/i },
  { id: 'home-energy-climate-locks', name: 'Home energy, climate, locks and alarms', kinds: 'thermostats, heat pumps, solar inverters, home batteries, smart meters, door locks, alarm systems, smoke detectors, robot vacuums, large appliances', doors: ['network', 'bluetooth'], deepest: 'Read. Locks, alarms, detectors, heating and batteries are look-only', route: 'the maker\'s documented interface', built: built(['identify', 'read']), lookOnly: true, words: /\b(thermostat|heat pump|inverter|solar|home battery|smart meter|door lock|nuki|alarm|smoke detector|vacuum|roomba|tado|netatmo)\b/i },
];

/**
 * The families a device seems to belong to, from what it reports: a guess with its reason, never proof.
 * @param {{vendorId?: number, name?: string, maker?: string, services?: string[], type?: string}} device - what a door saw.
 * @returns {{family: object, why: string}[]} the likely families, best first.
 */
export function familiesOf(device) {
  const text = [device?.name, device?.maker, device?.model].filter(Boolean).join(' ');
  const out = [];
  for (const family of FAMILIES) {
    if (Number.isInteger(device?.vendorId) && family.usb?.includes(device.vendorId)) out.push({ family, why: `its USB maker number 0x${device.vendorId.toString(16).padStart(4, '0')}`, score: 2 });
    else if (text && family.words?.test(text)) out.push({ family, why: 'its name', score: 2 });
    else if (device?.type && family.mdns?.includes(device.type)) out.push({ family, why: `it announces ${device.type}`, score: 1 });
    else if ((device?.services ?? []).some((service) => family.ble?.includes(String(service).toUpperCase()))) out.push({ family, why: 'the Bluetooth services it offers', score: 1 });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

/** @returns {string} the catalogue as a plain file. */
export function catalogueText() {
  return [
    '# The kinds of device Devices knows',
    '',
    'Devices\' catalogue: 22 families of what people commonly have at home. Every family has Identify and Read through Devices\' doors. Adjust and Write exist only where a recipe is built, and are added family by family when you ask. Edit this file as you like: Devices never replaces it.',
    '',
    '| Family | Kinds of device | Door | Deepest level | Route | Built so far |',
    '| --- | --- | --- | --- | --- | --- |',
    ...FAMILIES.map((family) => `| ${family.name}${family.lookOnly ? ' (look-only)' : ''} | ${family.kinds} | ${family.doors.join(', ')} | ${family.deepest} | ${family.route} | ${family.built.join('; ')} |`),
    '',
    'Never changed on any device: radio limits (transmit power, region, frequency, channel width) and a drone\'s failsafes.',
    '',
  ].join('\n');
}

/** @returns {string} one family's recipe as a plain file. */
export function recipeText(family) {
  return [
    `# Recipe: ${family.name}`,
    '',
    `- Kinds of device: ${family.kinds}`,
    `- Doors: ${family.doors.join(', ')}`,
    `- Deepest level: ${family.deepest}`,
    `- Route (open tools): ${family.route}`,
    `- Built in Devices so far: ${family.built.join('; ')}`,
    `- How Devices recognises it: ${[family.usb?.length ? `USB maker numbers ${family.usb.map((id) => `0x${id.toString(16).padStart(4, '0')}`).join(', ')}` : '', family.mdns?.length ? `it announces ${family.mdns.join(', ')}` : '', family.ble?.length ? `Bluetooth services ${family.ble.join(', ')}` : '', 'its name'].filter(Boolean).join('; ')}`,
    family.lookOnly ? '- Look-only: Devices reads it and changes nothing on it.' : '',
    family.never ? `- Never changed: ${family.never}.` : '- Never changed: radio limits (transmit power, region, frequency).',
    '- Adjust and Write steps not listed under "Built" are added only when you ask, from the maker\'s or the open project\'s own documentation.',
    '',
  ].filter((line) => line !== '').join('\n');
}
