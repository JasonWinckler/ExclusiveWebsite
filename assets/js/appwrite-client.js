function k(a, i, n, r) {
  function s(c) {
    return c instanceof n ? c : new n(function(e) {
      e(c);
    });
  }
  return new (n || (n = Promise))(function(c, e) {
    function u(t) {
      try {
        p(r.next(t));
      } catch (l) {
        e(l);
      }
    }
    function o(t) {
      try {
        p(r.throw(t));
      } catch (l) {
        e(l);
      }
    }
    function p(t) {
      t.done ? c(t.value) : s(t.value).then(u, o);
    }
    p((r = r.apply(a, [])).next());
  });
}
class b extends Error {
  /**
   * Initializes a Appwrite Exception.
   *
   * @param {string} message - The error message.
   * @param {number} code - The error code. Default is 0.
   * @param {string} type - The error type. Default is an empty string.
   * @param {string} response - The response string. Default is an empty string.
   */
  constructor(i, n = 0, r = "", s = "") {
    super(i), this.name = "AppwriteException", this.message = i, this.code = n, this.type = r, this.response = s;
  }
}
class f {
  constructor() {
    this.config = {
      endpoint: "https://cloud.appwrite.io/v1",
      endpointRealtime: "",
      project: "",
      jwt: "",
      locale: "",
      session: "",
      devkey: ""
    }, this.headers = {
      "x-sdk-name": "Web",
      "x-sdk-platform": "client",
      "x-sdk-language": "web",
      "x-sdk-version": "21.5.0",
      "X-Appwrite-Response-Format": "1.8.0"
    }, this.realtime = {
      socket: void 0,
      timeout: void 0,
      heartbeat: void 0,
      url: "",
      channels: /* @__PURE__ */ new Set(),
      subscriptions: /* @__PURE__ */ new Map(),
      subscriptionsCounter: 0,
      reconnect: !0,
      reconnectAttempts: 0,
      lastMessage: void 0,
      connect: () => {
        clearTimeout(this.realtime.timeout), this.realtime.timeout = window?.setTimeout(() => {
          this.realtime.createSocket();
        }, 50);
      },
      getTimeout: () => {
        switch (!0) {
          case this.realtime.reconnectAttempts < 5:
            return 1e3;
          case this.realtime.reconnectAttempts < 15:
            return 5e3;
          case this.realtime.reconnectAttempts < 100:
            return 1e4;
          default:
            return 6e4;
        }
      },
      createHeartbeat: () => {
        this.realtime.heartbeat && clearTimeout(this.realtime.heartbeat), this.realtime.heartbeat = window?.setInterval(() => {
          var i;
          (i = this.realtime.socket) === null || i === void 0 || i.send(JSON.stringify({
            type: "ping"
          }));
        }, 2e4);
      },
      createSocket: () => {
        var i, n, r;
        if (this.realtime.channels.size < 1) {
          this.realtime.reconnect = !1, (i = this.realtime.socket) === null || i === void 0 || i.close();
          return;
        }
        const s = new URLSearchParams();
        this.config.project && s.set("project", this.config.project), this.realtime.channels.forEach((e) => {
          s.append("channels[]", e);
        });
        const c = this.config.endpointRealtime + "/realtime?" + s.toString();
        (c !== this.realtime.url || // Check if URL is present
        !this.realtime.socket || // Check if WebSocket has not been created
        ((n = this.realtime.socket) === null || n === void 0 ? void 0 : n.readyState) > WebSocket.OPEN) && (this.realtime.socket && ((r = this.realtime.socket) === null || r === void 0 ? void 0 : r.readyState) < WebSocket.CLOSING && (this.realtime.reconnect = !1, this.realtime.socket.close()), this.realtime.url = c, this.realtime.socket = new WebSocket(c), this.realtime.socket.addEventListener("message", this.realtime.onMessage), this.realtime.socket.addEventListener("open", (e) => {
          this.realtime.reconnectAttempts = 0, this.realtime.createHeartbeat();
        }), this.realtime.socket.addEventListener("close", (e) => {
          var u, o, p;
          if (!this.realtime.reconnect || ((o = (u = this.realtime) === null || u === void 0 ? void 0 : u.lastMessage) === null || o === void 0 ? void 0 : o.type) === "error" && // Check if last message was of type error
          ((p = this.realtime) === null || p === void 0 ? void 0 : p.lastMessage.data).code === 1008) {
            this.realtime.reconnect = !0;
            return;
          }
          const t = this.realtime.getTimeout();
          console.error(`Realtime got disconnected. Reconnect will be attempted in ${t / 1e3} seconds.`, e.reason), setTimeout(() => {
            this.realtime.reconnectAttempts++, this.realtime.createSocket();
          }, t);
        }));
      },
      onMessage: (i) => {
        var n, r;
        try {
          const s = JSON.parse(i.data);
          switch (this.realtime.lastMessage = s, s.type) {
            case "connected":
              let c = this.config.session;
              if (!c) {
                const o = JSON.parse((n = window.localStorage.getItem("cookieFallback")) !== null && n !== void 0 ? n : "{}");
                c = o?.[`a_session_${this.config.project}`];
              }
              const e = s.data;
              c && !e.user && ((r = this.realtime.socket) === null || r === void 0 || r.send(JSON.stringify({
                type: "authentication",
                data: {
                  session: c
                }
              })));
              break;
            case "event":
              let u = s.data;
              if (u?.channels) {
                if (!u.channels.some((p) => this.realtime.channels.has(p)))
                  return;
                this.realtime.subscriptions.forEach((p) => {
                  u.channels.some((t) => p.channels.includes(t)) && setTimeout(() => p.callback(u));
                });
              }
              break;
            case "pong":
              break;
            // Handle pong response if needed
            case "error":
              throw s.data;
            default:
              break;
          }
        } catch (s) {
          console.error(s);
        }
      },
      cleanUp: (i) => {
        this.realtime.channels.forEach((n) => {
          i.includes(n) && (Array.from(this.realtime.subscriptions).some(([s, c]) => c.channels.includes(n)) || this.realtime.channels.delete(n));
        });
      }
    };
  }
  /**
   * Set Endpoint
   *
   * Your project endpoint
   *
   * @param {string} endpoint
   *
   * @returns {this}
   */
  setEndpoint(i) {
    if (!i.startsWith("http://") && !i.startsWith("https://"))
      throw new b("Invalid endpoint URL: " + i);
    return this.config.endpoint = i, this.config.endpointRealtime = i.replace("https://", "wss://").replace("http://", "ws://"), this;
  }
  /**
   * Set Realtime Endpoint
   *
   * @param {string} endpointRealtime
   *
   * @returns {this}
   */
  setEndpointRealtime(i) {
    if (!i.startsWith("ws://") && !i.startsWith("wss://"))
      throw new b("Invalid realtime endpoint URL: " + i);
    return this.config.endpointRealtime = i, this;
  }
  /**
   * Set Project
   *
   * Your project ID
   *
   * @param value string
   *
   * @return {this}
   */
  setProject(i) {
    return this.headers["X-Appwrite-Project"] = i, this.config.project = i, this;
  }
  /**
   * Set JWT
   *
   * Your secret JSON Web Token
   *
   * @param value string
   *
   * @return {this}
   */
  setJWT(i) {
    return this.headers["X-Appwrite-JWT"] = i, this.config.jwt = i, this;
  }
  /**
   * Set Locale
   *
   * @param value string
   *
   * @return {this}
   */
  setLocale(i) {
    return this.headers["X-Appwrite-Locale"] = i, this.config.locale = i, this;
  }
  /**
   * Set Session
   *
   * The user session to authenticate with
   *
   * @param value string
   *
   * @return {this}
   */
  setSession(i) {
    return this.headers["X-Appwrite-Session"] = i, this.config.session = i, this;
  }
  /**
   * Set DevKey
   *
   * Your secret dev API key
   *
   * @param value string
   *
   * @return {this}
   */
  setDevKey(i) {
    return this.headers["X-Appwrite-Dev-Key"] = i, this.config.devkey = i, this;
  }
  /**
   * Subscribes to Appwrite events and passes you the payload in realtime.
   *
   * @deprecated Use the Realtime service instead.
   * @see Realtime
   *
   * @param {string|string[]} channels
   * Channel to subscribe - pass a single channel as a string or multiple with an array of strings.
   *
   * Possible channels are:
   * - account
   * - collections
   * - collections.[ID]
   * - collections.[ID].documents
   * - documents
   * - documents.[ID]
   * - files
   * - files.[ID]
   * - executions
   * - executions.[ID]
   * - functions.[ID]
   * - teams
   * - teams.[ID]
   * - memberships
   * - memberships.[ID]
   * @param {(payload: RealtimeMessage) => void} callback Is called on every realtime update.
   * @returns {() => void} Unsubscribes from events.
   */
  subscribe(i, n) {
    let r = typeof i == "string" ? [i] : i;
    r.forEach((c) => this.realtime.channels.add(c));
    const s = this.realtime.subscriptionsCounter++;
    return this.realtime.subscriptions.set(s, {
      channels: r,
      callback: n
    }), this.realtime.connect(), () => {
      this.realtime.subscriptions.delete(s), this.realtime.cleanUp(r), this.realtime.connect();
    };
  }
  prepareRequest(i, n, r = {}, s = {}) {
    if (i = i.toUpperCase(), r = Object.assign({}, this.headers, r), typeof window < "u" && window.localStorage) {
      const e = window.localStorage.getItem("cookieFallback");
      e && (r["X-Fallback-Cookies"] = e);
    }
    let c = {
      method: i,
      headers: r
    };
    if (r["X-Appwrite-Dev-Key"] === void 0 && (c.credentials = "include"), i === "GET")
      for (const [e, u] of Object.entries(f.flatten(s)))
        n.searchParams.append(e, u);
    else
      switch (r["content-type"]) {
        case "application/json":
          c.body = JSON.stringify(s);
          break;
        case "multipart/form-data":
          const e = new FormData();
          for (const [u, o] of Object.entries(s))
            if (o instanceof File)
              e.append(u, o, o.name);
            else if (Array.isArray(o))
              for (const p of o)
                e.append(`${u}[]`, p);
            else
              e.append(u, o);
          c.body = e, delete r["content-type"];
          break;
      }
    return { uri: n.toString(), options: c };
  }
  chunkedUpload(i, n, r = {}, s = {}, c) {
    var e;
    return k(this, void 0, void 0, function* () {
      const [u, o] = (e = Object.entries(s).find(([l, d]) => d instanceof File)) !== null && e !== void 0 ? e : [];
      if (!o || !u)
        throw new Error("File not found in payload");
      if (o.size <= f.CHUNK_SIZE)
        return yield this.call(i, n, r, s);
      let p = 0, t = null;
      for (; p < o.size; ) {
        let l = p + f.CHUNK_SIZE;
        l >= o.size && (l = o.size), r["content-range"] = `bytes ${p}-${l - 1}/${o.size}`;
        const d = o.slice(p, l);
        let A = Object.assign({}, s);
        A[u] = new File([d], o.name), t = yield this.call(i, n, r, A), c && typeof c == "function" && c({
          $id: t.$id,
          progress: Math.round(l / o.size * 100),
          sizeUploaded: l,
          chunksTotal: Math.ceil(o.size / f.CHUNK_SIZE),
          chunksUploaded: Math.ceil(l / f.CHUNK_SIZE)
        }), t && t.$id && (r["x-appwrite-id"] = t.$id), p = l;
      }
      return t;
    });
  }
  ping() {
    return k(this, void 0, void 0, function* () {
      return this.call("GET", new URL(this.config.endpoint + "/ping"));
    });
  }
  call(i, n, r = {}, s = {}, c = "json") {
    var e, u;
    return k(this, void 0, void 0, function* () {
      const { uri: o, options: p } = this.prepareRequest(i, n, r, s);
      let t = null;
      const l = yield fetch(o, p);
      if (l.type === "opaque")
        throw new b(`Invalid Origin. Register your new client (${window.location.host}) as a new Web platform on your project console dashboard`, 403, "forbidden", "");
      const d = l.headers.get("x-appwrite-warning");
      if (d && d.split(";").forEach((h) => console.warn("Warning: " + h)), !((e = l.headers.get("content-type")) === null || e === void 0) && e.includes("application/json") ? t = yield l.json() : c === "arrayBuffer" ? t = yield l.arrayBuffer() : t = {
        message: yield l.text()
      }, 400 <= l.status) {
        let h = "";
        throw !((u = l.headers.get("content-type")) === null || u === void 0) && u.includes("application/json") || c === "arrayBuffer" ? h = JSON.stringify(t) : h = t?.message, new b(t?.message, l.status, t?.type, h);
      }
      const A = l.headers.get("X-Fallback-Cookies");
      return typeof window < "u" && window.localStorage && A && (window.console.warn("Appwrite is using localStorage for session management. Increase your security by adding a custom domain as your API endpoint."), window.localStorage.setItem("cookieFallback", A)), t;
    });
  }
  static flatten(i, n = "") {
    let r = {};
    for (const [s, c] of Object.entries(i)) {
      let e = n ? n + "[" + s + "]" : s;
      Array.isArray(c) ? r = Object.assign(Object.assign({}, r), f.flatten(c, e)) : r[e] = c;
    }
    return r;
  }
}
f.CHUNK_SIZE = 1024 * 1024 * 5;
var m;
(function(a) {
  a[a.NORMAL_CLOSURE = 1e3] = "NORMAL_CLOSURE", a[a.POLICY_VIOLATION = 1008] = "POLICY_VIOLATION", a[a.UNKNOWN_ERROR = -1] = "UNKNOWN_ERROR";
})(m || (m = {}));
var y;
(function(a) {
  a.Equal = "equal", a.NotEqual = "notEqual", a.GreaterThan = "greaterThan", a.GreaterThanEqual = "greaterThanEqual", a.LessThan = "lessThan", a.LessThanEqual = "lessThanEqual", a.Contains = "contains", a.IsNull = "isNull", a.IsNotNull = "isNotNull";
})(y || (y = {}));
var w;
(function(a) {
  a.Totp = "totp";
})(w || (w = {}));
var v;
(function(a) {
  a.Email = "email", a.Phone = "phone", a.Totp = "totp", a.Recoverycode = "recoverycode";
})(v || (v = {}));
var g;
(function(a) {
  a.Amazon = "amazon", a.Apple = "apple", a.Auth0 = "auth0", a.Authentik = "authentik", a.Autodesk = "autodesk", a.Bitbucket = "bitbucket", a.Bitly = "bitly", a.Box = "box", a.Dailymotion = "dailymotion", a.Discord = "discord", a.Disqus = "disqus", a.Dropbox = "dropbox", a.Etsy = "etsy", a.Facebook = "facebook", a.Figma = "figma", a.Github = "github", a.Gitlab = "gitlab", a.Google = "google", a.Linkedin = "linkedin", a.Microsoft = "microsoft", a.Notion = "notion", a.Oidc = "oidc", a.Okta = "okta", a.Paypal = "paypal", a.PaypalSandbox = "paypalSandbox", a.Podio = "podio", a.Salesforce = "salesforce", a.Slack = "slack", a.Spotify = "spotify", a.Stripe = "stripe", a.Tradeshift = "tradeshift", a.TradeshiftBox = "tradeshiftBox", a.Twitch = "twitch", a.Wordpress = "wordpress", a.Yahoo = "yahoo", a.Yammer = "yammer", a.Yandex = "yandex", a.Zoho = "zoho", a.Zoom = "zoom", a.Mock = "mock";
})(g || (g = {}));
var S;
(function(a) {
  a.AvantBrowser = "aa", a.AndroidWebViewBeta = "an", a.GoogleChrome = "ch", a.GoogleChromeIOS = "ci", a.GoogleChromeMobile = "cm", a.Chromium = "cr", a.MozillaFirefox = "ff", a.Safari = "sf", a.MobileSafari = "mf", a.MicrosoftEdge = "ps", a.MicrosoftEdgeIOS = "oi", a.OperaMini = "om", a.Opera = "op", a.OperaNext = "on";
})(S || (S = {}));
var E;
(function(a) {
  a.AmericanExpress = "amex", a.Argencard = "argencard", a.Cabal = "cabal", a.Cencosud = "cencosud", a.DinersClub = "diners", a.Discover = "discover", a.Elo = "elo", a.Hipercard = "hipercard", a.JCB = "jcb", a.Mastercard = "mastercard", a.Naranja = "naranja", a.TarjetaShopping = "targeta-shopping", a.UnionPay = "unionpay", a.Visa = "visa", a.MIR = "mir", a.Maestro = "maestro", a.Rupay = "rupay";
})(E || (E = {}));
var j;
(function(a) {
  a.Afghanistan = "af", a.Angola = "ao", a.Albania = "al", a.Andorra = "ad", a.UnitedArabEmirates = "ae", a.Argentina = "ar", a.Armenia = "am", a.AntiguaAndBarbuda = "ag", a.Australia = "au", a.Austria = "at", a.Azerbaijan = "az", a.Burundi = "bi", a.Belgium = "be", a.Benin = "bj", a.BurkinaFaso = "bf", a.Bangladesh = "bd", a.Bulgaria = "bg", a.Bahrain = "bh", a.Bahamas = "bs", a.BosniaAndHerzegovina = "ba", a.Belarus = "by", a.Belize = "bz", a.Bolivia = "bo", a.Brazil = "br", a.Barbados = "bb", a.BruneiDarussalam = "bn", a.Bhutan = "bt", a.Botswana = "bw", a.CentralAfricanRepublic = "cf", a.Canada = "ca", a.Switzerland = "ch", a.Chile = "cl", a.China = "cn", a.CoteDIvoire = "ci", a.Cameroon = "cm", a.DemocraticRepublicOfTheCongo = "cd", a.RepublicOfTheCongo = "cg", a.Colombia = "co", a.Comoros = "km", a.CapeVerde = "cv", a.CostaRica = "cr", a.Cuba = "cu", a.Cyprus = "cy", a.CzechRepublic = "cz", a.Germany = "de", a.Djibouti = "dj", a.Dominica = "dm", a.Denmark = "dk", a.DominicanRepublic = "do", a.Algeria = "dz", a.Ecuador = "ec", a.Egypt = "eg", a.Eritrea = "er", a.Spain = "es", a.Estonia = "ee", a.Ethiopia = "et", a.Finland = "fi", a.Fiji = "fj", a.France = "fr", a.MicronesiaFederatedStatesOf = "fm", a.Gabon = "ga", a.UnitedKingdom = "gb", a.Georgia = "ge", a.Ghana = "gh", a.Guinea = "gn", a.Gambia = "gm", a.GuineaBissau = "gw", a.EquatorialGuinea = "gq", a.Greece = "gr", a.Grenada = "gd", a.Guatemala = "gt", a.Guyana = "gy", a.Honduras = "hn", a.Croatia = "hr", a.Haiti = "ht", a.Hungary = "hu", a.Indonesia = "id", a.India = "in", a.Ireland = "ie", a.IranIslamicRepublicOf = "ir", a.Iraq = "iq", a.Iceland = "is", a.Israel = "il", a.Italy = "it", a.Jamaica = "jm", a.Jordan = "jo", a.Japan = "jp", a.Kazakhstan = "kz", a.Kenya = "ke", a.Kyrgyzstan = "kg", a.Cambodia = "kh", a.Kiribati = "ki", a.SaintKittsAndNevis = "kn", a.SouthKorea = "kr", a.Kuwait = "kw", a.LaoPeopleSDemocraticRepublic = "la", a.Lebanon = "lb", a.Liberia = "lr", a.Libya = "ly", a.SaintLucia = "lc", a.Liechtenstein = "li", a.SriLanka = "lk", a.Lesotho = "ls", a.Lithuania = "lt", a.Luxembourg = "lu", a.Latvia = "lv", a.Morocco = "ma", a.Monaco = "mc", a.Moldova = "md", a.Madagascar = "mg", a.Maldives = "mv", a.Mexico = "mx", a.MarshallIslands = "mh", a.NorthMacedonia = "mk", a.Mali = "ml", a.Malta = "mt", a.Myanmar = "mm", a.Montenegro = "me", a.Mongolia = "mn", a.Mozambique = "mz", a.Mauritania = "mr", a.Mauritius = "mu", a.Malawi = "mw", a.Malaysia = "my", a.Namibia = "na", a.Niger = "ne", a.Nigeria = "ng", a.Nicaragua = "ni", a.Netherlands = "nl", a.Norway = "no", a.Nepal = "np", a.Nauru = "nr", a.NewZealand = "nz", a.Oman = "om", a.Pakistan = "pk", a.Panama = "pa", a.Peru = "pe", a.Philippines = "ph", a.Palau = "pw", a.PapuaNewGuinea = "pg", a.Poland = "pl", a.FrenchPolynesia = "pf", a.NorthKorea = "kp", a.Portugal = "pt", a.Paraguay = "py", a.Qatar = "qa", a.Romania = "ro", a.Russia = "ru", a.Rwanda = "rw", a.SaudiArabia = "sa", a.Sudan = "sd", a.Senegal = "sn", a.Singapore = "sg", a.SolomonIslands = "sb", a.SierraLeone = "sl", a.ElSalvador = "sv", a.SanMarino = "sm", a.Somalia = "so", a.Serbia = "rs", a.SouthSudan = "ss", a.SaoTomeAndPrincipe = "st", a.Suriname = "sr", a.Slovakia = "sk", a.Slovenia = "si", a.Sweden = "se", a.Eswatini = "sz", a.Seychelles = "sc", a.Syria = "sy", a.Chad = "td", a.Togo = "tg", a.Thailand = "th", a.Tajikistan = "tj", a.Turkmenistan = "tm", a.TimorLeste = "tl", a.Tonga = "to", a.TrinidadAndTobago = "tt", a.Tunisia = "tn", a.Turkey = "tr", a.Tuvalu = "tv", a.Tanzania = "tz", a.Uganda = "ug", a.Ukraine = "ua", a.Uruguay = "uy", a.UnitedStates = "us", a.Uzbekistan = "uz", a.VaticanCity = "va", a.SaintVincentAndTheGrenadines = "vc", a.Venezuela = "ve", a.Vietnam = "vn", a.Vanuatu = "vu", a.Samoa = "ws", a.Yemen = "ye", a.SouthAfrica = "za", a.Zambia = "zm", a.Zimbabwe = "zw";
})(j || (j = {}));
var M;
(function(a) {
  a.Light = "light", a.Dark = "dark";
})(M || (M = {}));
var _;
(function(a) {
  a.AfricaAbidjan = "africa/abidjan", a.AfricaAccra = "africa/accra", a.AfricaAddisAbaba = "africa/addis_ababa", a.AfricaAlgiers = "africa/algiers", a.AfricaAsmara = "africa/asmara", a.AfricaBamako = "africa/bamako", a.AfricaBangui = "africa/bangui", a.AfricaBanjul = "africa/banjul", a.AfricaBissau = "africa/bissau", a.AfricaBlantyre = "africa/blantyre", a.AfricaBrazzaville = "africa/brazzaville", a.AfricaBujumbura = "africa/bujumbura", a.AfricaCairo = "africa/cairo", a.AfricaCasablanca = "africa/casablanca", a.AfricaCeuta = "africa/ceuta", a.AfricaConakry = "africa/conakry", a.AfricaDakar = "africa/dakar", a.AfricaDarEsSalaam = "africa/dar_es_salaam", a.AfricaDjibouti = "africa/djibouti", a.AfricaDouala = "africa/douala", a.AfricaElAaiun = "africa/el_aaiun", a.AfricaFreetown = "africa/freetown", a.AfricaGaborone = "africa/gaborone", a.AfricaHarare = "africa/harare", a.AfricaJohannesburg = "africa/johannesburg", a.AfricaJuba = "africa/juba", a.AfricaKampala = "africa/kampala", a.AfricaKhartoum = "africa/khartoum", a.AfricaKigali = "africa/kigali", a.AfricaKinshasa = "africa/kinshasa", a.AfricaLagos = "africa/lagos", a.AfricaLibreville = "africa/libreville", a.AfricaLome = "africa/lome", a.AfricaLuanda = "africa/luanda", a.AfricaLubumbashi = "africa/lubumbashi", a.AfricaLusaka = "africa/lusaka", a.AfricaMalabo = "africa/malabo", a.AfricaMaputo = "africa/maputo", a.AfricaMaseru = "africa/maseru", a.AfricaMbabane = "africa/mbabane", a.AfricaMogadishu = "africa/mogadishu", a.AfricaMonrovia = "africa/monrovia", a.AfricaNairobi = "africa/nairobi", a.AfricaNdjamena = "africa/ndjamena", a.AfricaNiamey = "africa/niamey", a.AfricaNouakchott = "africa/nouakchott", a.AfricaOuagadougou = "africa/ouagadougou", a.AfricaPortonovo = "africa/porto-novo", a.AfricaSaoTome = "africa/sao_tome", a.AfricaTripoli = "africa/tripoli", a.AfricaTunis = "africa/tunis", a.AfricaWindhoek = "africa/windhoek", a.AmericaAdak = "america/adak", a.AmericaAnchorage = "america/anchorage", a.AmericaAnguilla = "america/anguilla", a.AmericaAntigua = "america/antigua", a.AmericaAraguaina = "america/araguaina", a.AmericaArgentinaBuenosAires = "america/argentina/buenos_aires", a.AmericaArgentinaCatamarca = "america/argentina/catamarca", a.AmericaArgentinaCordoba = "america/argentina/cordoba", a.AmericaArgentinaJujuy = "america/argentina/jujuy", a.AmericaArgentinaLaRioja = "america/argentina/la_rioja", a.AmericaArgentinaMendoza = "america/argentina/mendoza", a.AmericaArgentinaRioGallegos = "america/argentina/rio_gallegos", a.AmericaArgentinaSalta = "america/argentina/salta", a.AmericaArgentinaSanJuan = "america/argentina/san_juan", a.AmericaArgentinaSanLuis = "america/argentina/san_luis", a.AmericaArgentinaTucuman = "america/argentina/tucuman", a.AmericaArgentinaUshuaia = "america/argentina/ushuaia", a.AmericaAruba = "america/aruba", a.AmericaAsuncion = "america/asuncion", a.AmericaAtikokan = "america/atikokan", a.AmericaBahia = "america/bahia", a.AmericaBahiaBanderas = "america/bahia_banderas", a.AmericaBarbados = "america/barbados", a.AmericaBelem = "america/belem", a.AmericaBelize = "america/belize", a.AmericaBlancsablon = "america/blanc-sablon", a.AmericaBoaVista = "america/boa_vista", a.AmericaBogota = "america/bogota", a.AmericaBoise = "america/boise", a.AmericaCambridgeBay = "america/cambridge_bay", a.AmericaCampoGrande = "america/campo_grande", a.AmericaCancun = "america/cancun", a.AmericaCaracas = "america/caracas", a.AmericaCayenne = "america/cayenne", a.AmericaCayman = "america/cayman", a.AmericaChicago = "america/chicago", a.AmericaChihuahua = "america/chihuahua", a.AmericaCiudadJuarez = "america/ciudad_juarez", a.AmericaCostaRica = "america/costa_rica", a.AmericaCoyhaique = "america/coyhaique", a.AmericaCreston = "america/creston", a.AmericaCuiaba = "america/cuiaba", a.AmericaCuracao = "america/curacao", a.AmericaDanmarkshavn = "america/danmarkshavn", a.AmericaDawson = "america/dawson", a.AmericaDawsonCreek = "america/dawson_creek", a.AmericaDenver = "america/denver", a.AmericaDetroit = "america/detroit", a.AmericaDominica = "america/dominica", a.AmericaEdmonton = "america/edmonton", a.AmericaEirunepe = "america/eirunepe", a.AmericaElSalvador = "america/el_salvador", a.AmericaFortNelson = "america/fort_nelson", a.AmericaFortaleza = "america/fortaleza", a.AmericaGlaceBay = "america/glace_bay", a.AmericaGooseBay = "america/goose_bay", a.AmericaGrandTurk = "america/grand_turk", a.AmericaGrenada = "america/grenada", a.AmericaGuadeloupe = "america/guadeloupe", a.AmericaGuatemala = "america/guatemala", a.AmericaGuayaquil = "america/guayaquil", a.AmericaGuyana = "america/guyana", a.AmericaHalifax = "america/halifax", a.AmericaHavana = "america/havana", a.AmericaHermosillo = "america/hermosillo", a.AmericaIndianaIndianapolis = "america/indiana/indianapolis", a.AmericaIndianaKnox = "america/indiana/knox", a.AmericaIndianaMarengo = "america/indiana/marengo", a.AmericaIndianaPetersburg = "america/indiana/petersburg", a.AmericaIndianaTellCity = "america/indiana/tell_city", a.AmericaIndianaVevay = "america/indiana/vevay", a.AmericaIndianaVincennes = "america/indiana/vincennes", a.AmericaIndianaWinamac = "america/indiana/winamac", a.AmericaInuvik = "america/inuvik", a.AmericaIqaluit = "america/iqaluit", a.AmericaJamaica = "america/jamaica", a.AmericaJuneau = "america/juneau", a.AmericaKentuckyLouisville = "america/kentucky/louisville", a.AmericaKentuckyMonticello = "america/kentucky/monticello", a.AmericaKralendijk = "america/kralendijk", a.AmericaLaPaz = "america/la_paz", a.AmericaLima = "america/lima", a.AmericaLosAngeles = "america/los_angeles", a.AmericaLowerPrinces = "america/lower_princes", a.AmericaMaceio = "america/maceio", a.AmericaManagua = "america/managua", a.AmericaManaus = "america/manaus", a.AmericaMarigot = "america/marigot", a.AmericaMartinique = "america/martinique", a.AmericaMatamoros = "america/matamoros", a.AmericaMazatlan = "america/mazatlan", a.AmericaMenominee = "america/menominee", a.AmericaMerida = "america/merida", a.AmericaMetlakatla = "america/metlakatla", a.AmericaMexicoCity = "america/mexico_city", a.AmericaMiquelon = "america/miquelon", a.AmericaMoncton = "america/moncton", a.AmericaMonterrey = "america/monterrey", a.AmericaMontevideo = "america/montevideo", a.AmericaMontserrat = "america/montserrat", a.AmericaNassau = "america/nassau", a.AmericaNewYork = "america/new_york", a.AmericaNome = "america/nome", a.AmericaNoronha = "america/noronha", a.AmericaNorthDakotaBeulah = "america/north_dakota/beulah", a.AmericaNorthDakotaCenter = "america/north_dakota/center", a.AmericaNorthDakotaNewSalem = "america/north_dakota/new_salem", a.AmericaNuuk = "america/nuuk", a.AmericaOjinaga = "america/ojinaga", a.AmericaPanama = "america/panama", a.AmericaParamaribo = "america/paramaribo", a.AmericaPhoenix = "america/phoenix", a.AmericaPortauprince = "america/port-au-prince", a.AmericaPortOfSpain = "america/port_of_spain", a.AmericaPortoVelho = "america/porto_velho", a.AmericaPuertoRico = "america/puerto_rico", a.AmericaPuntaArenas = "america/punta_arenas", a.AmericaRankinInlet = "america/rankin_inlet", a.AmericaRecife = "america/recife", a.AmericaRegina = "america/regina", a.AmericaResolute = "america/resolute", a.AmericaRioBranco = "america/rio_branco", a.AmericaSantarem = "america/santarem", a.AmericaSantiago = "america/santiago", a.AmericaSantoDomingo = "america/santo_domingo", a.AmericaSaoPaulo = "america/sao_paulo", a.AmericaScoresbysund = "america/scoresbysund", a.AmericaSitka = "america/sitka", a.AmericaStBarthelemy = "america/st_barthelemy", a.AmericaStJohns = "america/st_johns", a.AmericaStKitts = "america/st_kitts", a.AmericaStLucia = "america/st_lucia", a.AmericaStThomas = "america/st_thomas", a.AmericaStVincent = "america/st_vincent", a.AmericaSwiftCurrent = "america/swift_current", a.AmericaTegucigalpa = "america/tegucigalpa", a.AmericaThule = "america/thule", a.AmericaTijuana = "america/tijuana", a.AmericaToronto = "america/toronto", a.AmericaTortola = "america/tortola", a.AmericaVancouver = "america/vancouver", a.AmericaWhitehorse = "america/whitehorse", a.AmericaWinnipeg = "america/winnipeg", a.AmericaYakutat = "america/yakutat", a.AntarcticaCasey = "antarctica/casey", a.AntarcticaDavis = "antarctica/davis", a.AntarcticaDumontdurville = "antarctica/dumontdurville", a.AntarcticaMacquarie = "antarctica/macquarie", a.AntarcticaMawson = "antarctica/mawson", a.AntarcticaMcmurdo = "antarctica/mcmurdo", a.AntarcticaPalmer = "antarctica/palmer", a.AntarcticaRothera = "antarctica/rothera", a.AntarcticaSyowa = "antarctica/syowa", a.AntarcticaTroll = "antarctica/troll", a.AntarcticaVostok = "antarctica/vostok", a.ArcticLongyearbyen = "arctic/longyearbyen", a.AsiaAden = "asia/aden", a.AsiaAlmaty = "asia/almaty", a.AsiaAmman = "asia/amman", a.AsiaAnadyr = "asia/anadyr", a.AsiaAqtau = "asia/aqtau", a.AsiaAqtobe = "asia/aqtobe", a.AsiaAshgabat = "asia/ashgabat", a.AsiaAtyrau = "asia/atyrau", a.AsiaBaghdad = "asia/baghdad", a.AsiaBahrain = "asia/bahrain", a.AsiaBaku = "asia/baku", a.AsiaBangkok = "asia/bangkok", a.AsiaBarnaul = "asia/barnaul", a.AsiaBeirut = "asia/beirut", a.AsiaBishkek = "asia/bishkek", a.AsiaBrunei = "asia/brunei", a.AsiaChita = "asia/chita", a.AsiaColombo = "asia/colombo", a.AsiaDamascus = "asia/damascus", a.AsiaDhaka = "asia/dhaka", a.AsiaDili = "asia/dili", a.AsiaDubai = "asia/dubai", a.AsiaDushanbe = "asia/dushanbe", a.AsiaFamagusta = "asia/famagusta", a.AsiaGaza = "asia/gaza", a.AsiaHebron = "asia/hebron", a.AsiaHoChiMinh = "asia/ho_chi_minh", a.AsiaHongKong = "asia/hong_kong", a.AsiaHovd = "asia/hovd", a.AsiaIrkutsk = "asia/irkutsk", a.AsiaJakarta = "asia/jakarta", a.AsiaJayapura = "asia/jayapura", a.AsiaJerusalem = "asia/jerusalem", a.AsiaKabul = "asia/kabul", a.AsiaKamchatka = "asia/kamchatka", a.AsiaKarachi = "asia/karachi", a.AsiaKathmandu = "asia/kathmandu", a.AsiaKhandyga = "asia/khandyga", a.AsiaKolkata = "asia/kolkata", a.AsiaKrasnoyarsk = "asia/krasnoyarsk", a.AsiaKualaLumpur = "asia/kuala_lumpur", a.AsiaKuching = "asia/kuching", a.AsiaKuwait = "asia/kuwait", a.AsiaMacau = "asia/macau", a.AsiaMagadan = "asia/magadan", a.AsiaMakassar = "asia/makassar", a.AsiaManila = "asia/manila", a.AsiaMuscat = "asia/muscat", a.AsiaNicosia = "asia/nicosia", a.AsiaNovokuznetsk = "asia/novokuznetsk", a.AsiaNovosibirsk = "asia/novosibirsk", a.AsiaOmsk = "asia/omsk", a.AsiaOral = "asia/oral", a.AsiaPhnomPenh = "asia/phnom_penh", a.AsiaPontianak = "asia/pontianak", a.AsiaPyongyang = "asia/pyongyang", a.AsiaQatar = "asia/qatar", a.AsiaQostanay = "asia/qostanay", a.AsiaQyzylorda = "asia/qyzylorda", a.AsiaRiyadh = "asia/riyadh", a.AsiaSakhalin = "asia/sakhalin", a.AsiaSamarkand = "asia/samarkand", a.AsiaSeoul = "asia/seoul", a.AsiaShanghai = "asia/shanghai", a.AsiaSingapore = "asia/singapore", a.AsiaSrednekolymsk = "asia/srednekolymsk", a.AsiaTaipei = "asia/taipei", a.AsiaTashkent = "asia/tashkent", a.AsiaTbilisi = "asia/tbilisi", a.AsiaTehran = "asia/tehran", a.AsiaThimphu = "asia/thimphu", a.AsiaTokyo = "asia/tokyo", a.AsiaTomsk = "asia/tomsk", a.AsiaUlaanbaatar = "asia/ulaanbaatar", a.AsiaUrumqi = "asia/urumqi", a.AsiaUstnera = "asia/ust-nera", a.AsiaVientiane = "asia/vientiane", a.AsiaVladivostok = "asia/vladivostok", a.AsiaYakutsk = "asia/yakutsk", a.AsiaYangon = "asia/yangon", a.AsiaYekaterinburg = "asia/yekaterinburg", a.AsiaYerevan = "asia/yerevan", a.AtlanticAzores = "atlantic/azores", a.AtlanticBermuda = "atlantic/bermuda", a.AtlanticCanary = "atlantic/canary", a.AtlanticCapeVerde = "atlantic/cape_verde", a.AtlanticFaroe = "atlantic/faroe", a.AtlanticMadeira = "atlantic/madeira", a.AtlanticReykjavik = "atlantic/reykjavik", a.AtlanticSouthGeorgia = "atlantic/south_georgia", a.AtlanticStHelena = "atlantic/st_helena", a.AtlanticStanley = "atlantic/stanley", a.AustraliaAdelaide = "australia/adelaide", a.AustraliaBrisbane = "australia/brisbane", a.AustraliaBrokenHill = "australia/broken_hill", a.AustraliaDarwin = "australia/darwin", a.AustraliaEucla = "australia/eucla", a.AustraliaHobart = "australia/hobart", a.AustraliaLindeman = "australia/lindeman", a.AustraliaLordHowe = "australia/lord_howe", a.AustraliaMelbourne = "australia/melbourne", a.AustraliaPerth = "australia/perth", a.AustraliaSydney = "australia/sydney", a.EuropeAmsterdam = "europe/amsterdam", a.EuropeAndorra = "europe/andorra", a.EuropeAstrakhan = "europe/astrakhan", a.EuropeAthens = "europe/athens", a.EuropeBelgrade = "europe/belgrade", a.EuropeBerlin = "europe/berlin", a.EuropeBratislava = "europe/bratislava", a.EuropeBrussels = "europe/brussels", a.EuropeBucharest = "europe/bucharest", a.EuropeBudapest = "europe/budapest", a.EuropeBusingen = "europe/busingen", a.EuropeChisinau = "europe/chisinau", a.EuropeCopenhagen = "europe/copenhagen", a.EuropeDublin = "europe/dublin", a.EuropeGibraltar = "europe/gibraltar", a.EuropeGuernsey = "europe/guernsey", a.EuropeHelsinki = "europe/helsinki", a.EuropeIsleOfMan = "europe/isle_of_man", a.EuropeIstanbul = "europe/istanbul", a.EuropeJersey = "europe/jersey", a.EuropeKaliningrad = "europe/kaliningrad", a.EuropeKirov = "europe/kirov", a.EuropeKyiv = "europe/kyiv", a.EuropeLisbon = "europe/lisbon", a.EuropeLjubljana = "europe/ljubljana", a.EuropeLondon = "europe/london", a.EuropeLuxembourg = "europe/luxembourg", a.EuropeMadrid = "europe/madrid", a.EuropeMalta = "europe/malta", a.EuropeMariehamn = "europe/mariehamn", a.EuropeMinsk = "europe/minsk", a.EuropeMonaco = "europe/monaco", a.EuropeMoscow = "europe/moscow", a.EuropeOslo = "europe/oslo", a.EuropeParis = "europe/paris", a.EuropePodgorica = "europe/podgorica", a.EuropePrague = "europe/prague", a.EuropeRiga = "europe/riga", a.EuropeRome = "europe/rome", a.EuropeSamara = "europe/samara", a.EuropeSanMarino = "europe/san_marino", a.EuropeSarajevo = "europe/sarajevo", a.EuropeSaratov = "europe/saratov", a.EuropeSimferopol = "europe/simferopol", a.EuropeSkopje = "europe/skopje", a.EuropeSofia = "europe/sofia", a.EuropeStockholm = "europe/stockholm", a.EuropeTallinn = "europe/tallinn", a.EuropeTirane = "europe/tirane", a.EuropeUlyanovsk = "europe/ulyanovsk", a.EuropeVaduz = "europe/vaduz", a.EuropeVatican = "europe/vatican", a.EuropeVienna = "europe/vienna", a.EuropeVilnius = "europe/vilnius", a.EuropeVolgograd = "europe/volgograd", a.EuropeWarsaw = "europe/warsaw", a.EuropeZagreb = "europe/zagreb", a.EuropeZurich = "europe/zurich", a.IndianAntananarivo = "indian/antananarivo", a.IndianChagos = "indian/chagos", a.IndianChristmas = "indian/christmas", a.IndianCocos = "indian/cocos", a.IndianComoro = "indian/comoro", a.IndianKerguelen = "indian/kerguelen", a.IndianMahe = "indian/mahe", a.IndianMaldives = "indian/maldives", a.IndianMauritius = "indian/mauritius", a.IndianMayotte = "indian/mayotte", a.IndianReunion = "indian/reunion", a.PacificApia = "pacific/apia", a.PacificAuckland = "pacific/auckland", a.PacificBougainville = "pacific/bougainville", a.PacificChatham = "pacific/chatham", a.PacificChuuk = "pacific/chuuk", a.PacificEaster = "pacific/easter", a.PacificEfate = "pacific/efate", a.PacificFakaofo = "pacific/fakaofo", a.PacificFiji = "pacific/fiji", a.PacificFunafuti = "pacific/funafuti", a.PacificGalapagos = "pacific/galapagos", a.PacificGambier = "pacific/gambier", a.PacificGuadalcanal = "pacific/guadalcanal", a.PacificGuam = "pacific/guam", a.PacificHonolulu = "pacific/honolulu", a.PacificKanton = "pacific/kanton", a.PacificKiritimati = "pacific/kiritimati", a.PacificKosrae = "pacific/kosrae", a.PacificKwajalein = "pacific/kwajalein", a.PacificMajuro = "pacific/majuro", a.PacificMarquesas = "pacific/marquesas", a.PacificMidway = "pacific/midway", a.PacificNauru = "pacific/nauru", a.PacificNiue = "pacific/niue", a.PacificNorfolk = "pacific/norfolk", a.PacificNoumea = "pacific/noumea", a.PacificPagoPago = "pacific/pago_pago", a.PacificPalau = "pacific/palau", a.PacificPitcairn = "pacific/pitcairn", a.PacificPohnpei = "pacific/pohnpei", a.PacificPortMoresby = "pacific/port_moresby", a.PacificRarotonga = "pacific/rarotonga", a.PacificSaipan = "pacific/saipan", a.PacificTahiti = "pacific/tahiti", a.PacificTarawa = "pacific/tarawa", a.PacificTongatapu = "pacific/tongatapu", a.PacificWake = "pacific/wake", a.PacificWallis = "pacific/wallis", a.Utc = "utc";
})(_ || (_ = {}));
var N;
(function(a) {
  a.Jpg = "jpg", a.Jpeg = "jpeg", a.Png = "png", a.Webp = "webp", a.Heic = "heic", a.Avif = "avif", a.Gif = "gif";
})(N || (N = {}));
var B;
(function(a) {
  a.GET = "GET", a.POST = "POST", a.PUT = "PUT", a.PATCH = "PATCH", a.DELETE = "DELETE", a.OPTIONS = "OPTIONS", a.HEAD = "HEAD";
})(B || (B = {}));
var L;
(function(a) {
  a.Center = "center", a.Topleft = "top-left", a.Top = "top", a.Topright = "top-right", a.Left = "left", a.Right = "right", a.Bottomleft = "bottom-left", a.Bottom = "bottom", a.Bottomright = "bottom-right";
})(L || (L = {}));
var P;
(function(a) {
  a.Jpg = "jpg", a.Jpeg = "jpeg", a.Png = "png", a.Webp = "webp", a.Heic = "heic", a.Avif = "avif", a.Gif = "gif";
})(P || (P = {}));
var I;
(function(a) {
  a.Http = "http", a.Schedule = "schedule", a.Event = "event";
})(I || (I = {}));
var R;
(function(a) {
  a.Waiting = "waiting", a.Processing = "processing", a.Completed = "completed", a.Failed = "failed", a.Scheduled = "scheduled";
})(R || (R = {}));
const D = new f().setEndpoint("https://fra.cloud.appwrite.io/v1").setProject("6a64cbeb0009826c9efc");
D.ping().then(() => console.info("Appwrite connection verified.")).catch((a) => console.warn("Appwrite ping was not successful.", a));
