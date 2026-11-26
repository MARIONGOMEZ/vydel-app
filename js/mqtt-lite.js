/* Minimal MQTT 3.1.1 over WebSocket — no patient logging. */
(function (w) {
  "use strict";
  function utf8(s) { return new TextEncoder().encode(s); }
  function fromUtf8(u8) { return new TextDecoder().decode(u8); }
  function encStr(s) {
    var b = utf8(s);
    var o = new Uint8Array(2 + b.length);
    o[0] = (b.length >> 8) & 255;
    o[1] = b.length & 255;
    o.set(b, 2);
    return o;
  }
  function remLen(n) {
    var out = [];
    do {
      var d = n % 128;
      n = Math.floor(n / 128);
      if (n > 0) d |= 128;
      out.push(d);
    } while (n > 0);
    return out;
  }
  function concat(parts) {
    var n = 0, i = 0, p, o;
    for (i = 0; i < parts.length; i++) n += parts[i].length;
    o = new Uint8Array(n);
    n = 0;
    for (i = 0; i < parts.length; i++) { o.set(parts[i], n); n += parts[i].length; }
    return o;
  }
  function packet(type, variable) {
    var rl = remLen(variable.length);
    var o = new Uint8Array(1 + rl.length + variable.length);
    o[0] = type;
    o.set(rl, 1);
    o.set(variable, 1 + rl.length);
    return o;
  }
  function connectPkt(cid) {
    var proto = encStr("MQTT");
    var vh = new Uint8Array(proto.length + 4);
    vh.set(proto, 0);
    var i = proto.length;
    vh[i] = 4;
    vh[i + 1] = 2;
    vh[i + 2] = 0;
    vh[i + 3] = 45;
    return packet(0x10, concat([vh, encStr(cid)]));
  }
  function publishPkt(topic, payload, retain) {
    return packet(retain ? 0x31 : 0x30, concat([encStr(topic), utf8(payload)]));
  }
  function subscribePkt(mid, topic) {
    return packet(0x82, concat([
      new Uint8Array([(mid >> 8) & 255, mid & 255]),
      encStr(topic),
      new Uint8Array([0])
    ]));
  }
  function parsePackets(buf, fn) {
    var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    var i = 0;
    while (i < u8.length) {
      if (i + 1 >= u8.length) break;
      var type = u8[i], mul = 1, len = 0, j = i + 1;
      while (j < u8.length) {
        var d = u8[j++];
        len += (d & 127) * mul;
        mul *= 128;
        if ((d & 128) === 0) break;
      }
      if (j + len > u8.length) break;
      fn(type, u8.subarray(j, j + len));
      i = j + len;
    }
  }
  function parsePublish(type, body) {
    var tlen = (body[0] << 8) | body[1];
    var pos = 2 + tlen;
    if (((type >> 1) & 3) > 0) pos += 2;
    return fromUtf8(body.subarray(pos));
  }

  w.TourneeMqtt = {
    connect: function (urls, topic, onMsg, onReady, onErr) {
      var idx = 0, ws = null, ping = null, stopped = false, ready = false;
      var cid = "t" + Math.random().toString(16).slice(2, 10);
      function cleanup() {
        if (ping) { clearInterval(ping); ping = null; }
      }
      function open() {
        if (stopped) return;
        if (idx >= urls.length) {
          idx = 0;
          if (onErr) onErr("mqtt");
          if (!stopped) setTimeout(open, 4000);
          return;
        }
        var url = urls[idx++];
        try { ws = new WebSocket(url, "mqtt"); }
        catch (e) { open(); return; }
        ws.binaryType = "arraybuffer";
        ws.onopen = function () { try { ws.send(connectPkt(cid)); } catch (e2) {} };
        ws.onmessage = function (ev) {
          parsePackets(ev.data, function (type, body) {
            var t = type & 0xf0;
            if (t === 0x20) {
              ready = true;
              try { ws.send(subscribePkt(1, topic)); } catch (e3) {}
              try { ws.send(subscribePkt(2, topic + "/voix/+")); } catch (e6) {}
              try { ws.send(subscribePkt(3, topic + "/ph")); } catch (e7) {}
              cleanup();
              ping = setInterval(function () {
                if (ws && ws.readyState === 1) {
                  try { ws.send(new Uint8Array([0xC0, 0x00])); } catch (e4) {}
                }
              }, 20000);
              if (onReady) onReady();
            } else if (t === 0x30) {
              try { onMsg && onMsg(parsePublish(type, body)); } catch (e5) {}
            }
          });
        };
        ws.onerror = function () {};
        ws.onclose = function () {
          cleanup();
          ready = false;
          if (!stopped) setTimeout(open, 800);
        };
      }
      open();
      return {
        publish: function (text, retain) {
          if (!ws || ws.readyState !== 1 || !ready) return false;
          try { ws.send(publishPkt(topic, text, retain !== false)); return true; }
          catch (e) { return false; }
        },
        publishTo: function (sub, text, retain) {
          if (!ws || ws.readyState !== 1 || !ready) return false;
          try { ws.send(publishPkt(topic + "/" + sub, text, retain !== false)); return true; }
          catch (e) { return false; }
        },
        close: function () {
          stopped = true;
          cleanup();
          try { if (ws) ws.close(); } catch (e) {}
        }
      };
    }
  };
})(window);
