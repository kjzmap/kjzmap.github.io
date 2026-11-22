/* 群友地图 · 极简版
 * 只做一件事：把群友的位置、名字、头像放到地图上。
 * 没有用户系统，没有审批，没有聊天。
 */
(function () {
  'use strict';

  var CHINA_BOUNDS = [[18.2, 73.4], [53.9, 135.2]];
  var TILE_URL = 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}';
  var API_BASE = document.querySelector('meta[name="qunyou-api-base"]')?.content || '';
  var API_URL = API_BASE + 'api/markers';
  var ADMIN_URL = API_BASE + 'api/admin';
  var SS_ADMIN = 'qunmap.adminSession.v1';
  var LS_MARKERS = 'qunmap.markers.v1';
  var LS_OWNER = 'qunmap.owner.v2';
  var LS_MAP_MODE = 'qunmap.mapmode.v1';
  var LS_CLUSTER = 'qunmap.cluster.v1';
  var NAME_MAX = 16;
  var AVATAR_PATTERN = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;
  var MIN_ZOOM = 3;
  var SIMPLE_MIN_ZOOM = 1;
  var PROVINCE_LABEL_ZOOM = 3.5;
  var WORLD_BOUNDS = [[-85, -180], [85, 180]];
  var MAX_ZOOM = 14;
  var SIMPLE_MAX_ZOOM = 10;
  var CITY_LABEL_ZOOM = 7;
  var CLUSTER_RADIUS = 65;
  var CLUSTER_MIN_RADIUS = 44;
  var AVATAR_RADIUS = 20;
  var SPIDER_SPACING = 52;
  var SPIDER_PAGED_MIN_RADIUS = 88;
  var EMOJIS = ['😀', '😄', '😎', '🥳', '🐱', '🐶', '🐼', '🦊', '🐸', '🐳', '🍊', '🍓', '🍰', '🍜', '🍵', '🎧', '🎸', '🚀', '✈️', '🪐', '🌈', '⚽', '🔥', '🌰', '🚦', '🥐', '🍧', '🍬', '🍡', '🐚', '🪁'];
  var EMOJI_SET = new Set(EMOJIS);

  var els = {
    map: document.getElementById('map'),
    count: document.getElementById('count'),
    mode: document.getElementById('mode'),
    peoplePanel: document.getElementById('peoplePanel'),
    peopleScrim: document.getElementById('peopleScrim'),
    peopleList: document.getElementById('peopleList'),
    peopleCount: document.getElementById('peopleCount'),
    peopleClose: document.getElementById('peopleClose'),
    peopleToggle: document.getElementById('peopleToggle'),
    peopleToggleCount: document.getElementById('peopleToggleCount'),
    peopleEmpty: document.getElementById('peopleEmpty'),
    pickHint: document.getElementById('pickHint'),
    sheet: document.getElementById('sheet'),
    sheetTitle: document.getElementById('sheetTitle'),
    sheetSub: document.getElementById('sheetSub'),
    closeSheet: document.getElementById('closeSheet'),
    pinForm: document.getElementById('pinForm'),
    name: document.getElementById('name'),
    emojiPicker: document.getElementById('emojiPicker'),
    preview: document.getElementById('preview'),
    coord: document.getElementById('coord'),
    formError: document.getElementById('formError'),
    save: document.getElementById('save'),
    cancel: document.getElementById('cancel'),
    remove: document.getElementById('remove'),
    note: document.getElementById('note'),
    pickBtn: document.getElementById('pickBtn'),
    pickLabel: document.getElementById('pickLabel'),
    ctaWrap: document.querySelector('.cta-wrap'),
    mapMode: document.getElementById('mapMode'),
    clusterToggle: document.getElementById('clusterToggle'),
    avatarFile: document.getElementById('avatarFile'),
    clearAvatar: document.getElementById('clearAvatar'),
    avatarStatus: document.getElementById('avatarStatus'),
    duration: document.getElementById('duration'),
    durationDays: document.getElementById('durationDays'),
    durationDaysField: document.getElementById('durationDaysField'),
    myMarkers: document.getElementById('myMarkers'),
    adminButton: document.getElementById('adminButton'),
    manageDialog: document.getElementById('manageDialog'),
    manageTitle: document.getElementById('manageTitle'),
    closeManage: document.getElementById('closeManage'),
    adminForm: document.getElementById('adminForm'),
    adminPassword: document.getElementById('adminPassword'),
    adminLogin: document.getElementById('adminLogin'),
    manageStatus: document.getElementById('manageStatus'),
    manageList: document.getElementById('manageList'),
    adminTools: document.getElementById('adminTools'),
    adminRefresh: document.getElementById('adminRefresh'),
    adminLogout: document.getElementById('adminLogout'),
    toast: document.getElementById('toast')
  };

  var state = {
    ready: false,
    mode: 'local',
    mapMode: 'standard',
    clusterEnabled: false,
    markers: [],
    ownerKey: null,
    admin: false,
    adminToken: '',
    adminMarkers: [],
    manageView: 'mine',
    manageBusy: false,
    avatar: '',
    avatarLoading: false,
    avatarRequest: 0,
    picking: false,
    editing: null,
    emoji: '',
    tempLatLng: null,
    saving: false,
    pulseId: null,
    removeArmed: false,
    peopleOpen: false,
    tileErrors: 0,
    tileLoads: 0
  };

  var map = null;
  var tileLayer = null;
  var provinceLayer = null;
  var worldLayer = null;
  var countryLabels = [];
  var provinceLabelLayer = null;
  var cityLayer = null;
  var markerLayer = null;
  var spiderLayer = null;
  var tempMarker = null;
  var markerIndex = new Map();
  var renderedMarkers = [];
  var spider = null;
  var hoveredPin = null;
  var highlightedPin = null;
  var markerFrame = 0;
  var pendingPerson = null;
  var personPopup = null;
  var popupTrigger = null;
  var zoomControlEl = null;
  var zoomRange = null;
  var zoomInBtn = null;
  var zoomOutBtn = null;
  var compactQuery = window.matchMedia ? window.matchMedia('(max-width: 720px)') : null;
  var wasCompact = false;
  var toastTimer = 0;
  var removeTimer = 0;
  var tempRefreshTimer = 0;
  var focusTimer = 0;
  var expiryTimer = 0;

  boot();

  function boot() {
    if (!window.L) {
      els.count.textContent = '地图库加载失败';
      return;
    }

    createMap();
    bindEvents();
    setClustering(loadClustering(), false);
    applyMapMode(loadMapMode(), false);
    wasCompact = isCompact();
    setPeopleOpen(!wasCompact);

    // 方便在控制台查看状态，不参与业务逻辑。
    window.qunyouMap = {
      getMap: function () { return map; },
      getMode: function () { return state.mode; },
      getMapMode: function () { return state.mapMode; },
      hasProvinceLayer: function () { return !!provinceLayer; },
      getMarkers: function () { return visibleMarkers(); }
    };

    state.ownerKey = getOwnerKey();
    if (API_BASE) {
      try { state.adminToken = sessionStorage.getItem(SS_ADMIN) || ''; } catch (error) { /* 仅本次会话 */ }
    }
    loadData();
  }

  /* ---------- 地图 ---------- */

  function createMap() {
    map = L.map('map', {
      zoomControl: false,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      zoomSnap: 0.5,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 90,
      worldCopyJump: false
    });

    L.control.scale({ position: 'bottomleft', imperial: false, maxWidth: 110 }).addTo(map);
    addZoomControl();
    map.attributionControl.setPrefix(false);

    tileLayer = L.tileLayer(TILE_URL, {
      subdomains: ['1', '2', '3', '4'],
      tms: false,
      minZoom: 3,
      maxZoom: MAX_ZOOM,
      attribution: '&copy; <a href="https://www.amap.com/" target="_blank" rel="noopener">高德地图</a> · GCJ-02'
    });

    tileLayer.on('tileerror', onTileError);
    tileLayer.on('tileload', function () { state.tileLoads += 1; });

    markerLayer = L.layerGroup().addTo(map);
    spiderLayer = L.layerGroup().addTo(map);
    map.on('zoomend', function () {
      if (state.clusterEnabled) renderMarkers(visibleMarkers());
    });
    map.on('moveend', function () {
      if (pendingPerson !== null) {
        var selection = pendingPerson;
        pendingPerson = null;
        revealPerson(selection);
      }
      queueMarkerLayout();
    });
    map.on('popupclose', function (event) {
      if (event.popup !== personPopup) return;
      personPopup = null;
      popupTrigger = null;
    });
    map.on('resize', function () {
      collapseSpider();
      if (state.ready && state.clusterEnabled) renderMarkers(visibleMarkers());
    });
    buildBoundaryLayers();

    if (window.matchMedia && window.matchMedia('(max-width: 720px)').matches) {
      map.setView([33, 113], 4.5, { animate: false });
    } else {
      map.fitBounds(CHINA_BOUNDS, { padding: [16, 16], animate: false });
    }
  }

  /* ---------- 省界底图 ---------- */

  function buildBoundaryLayers() {
    var geo = window.QUNYOU_GEO;
    if (!geo || !geo.provinces || !Array.isArray(geo.provinces.features)) return;

    map.createPane('qmLabels');
    map.getPane('qmLabels').style.zIndex = 450;
    map.getPane('qmLabels').style.pointerEvents = 'none';

    provinceLayer = L.geoJSON(geo.provinces, {
      pane: 'overlayPane',
      interactive: false,
      style: {
        color: '#b9ad98',
        weight: 1,
        opacity: 0.85,
        fillColor: '#faf7ef',
        fillOpacity: 1
      },
      attribution: '省界：<a href="https://datav.aliyun.com/portal/school/atlas/area_selector" target="_blank" rel="noopener">阿里云 DataV</a> · GCJ-02'
    });

    provinceLabelLayer = L.layerGroup();
    (geo.provinces.features || []).forEach(function (feature) {
      var props = feature.properties || {};
      var point = props.label;
      if (!point || isMunicipality(props.name)) return;
      provinceLabelLayer.addLayer(makeMapLabel(shortProvinceName(props.name), point, 'qm-province-label'));
    });

    cityLayer = L.layerGroup();
    (geo.cities || []).forEach(function (city) {
      if (!city || !isFinite(city.lng) || !isFinite(city.lat)) return;
      cityLayer.addLayer(makeMapLabel(city.name, [city.lng, city.lat], 'qm-city-label'));
    });
  }

  function buildWorldLayer() {
    var world = window.QUNYOU_WORLD;
    if (!world || !world.countries) return;
    var pane = map.createPane('qmWorld');
    pane.style.zIndex = '390';
    pane.style.pointerEvents = 'none';
    worldLayer = L.geoJSON(world.countries, {
      pane: 'qmWorld',
      renderer: L.canvas({ pane: 'qmWorld', padding: .35 }),
      interactive: false,
      style: function (feature) {
        return {
          stroke: !feature.properties.domestic,
          color: '#a1afb6',
          weight: 1,
          fillColor: feature.properties.domestic ? '#faf7ef' : '#f2f5f3',
          fillOpacity: 1
        };
      },
      attribution: '国界：<a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a>'
    });
    countryLabels = world.labels.map(function (entry) {
      return {
        marker: makeMapLabel(entry.name, entry.point, 'qm-country-label'),
        minZoom: entry.minZoom,
        countryOverview: entry.countryOverview === true
      };
    });
  }

  function syncCountryLabels(simple, zoom) {
    countryLabels.forEach(function (label) {
      var visible = simple && zoom >= label.minZoom &&
        (!label.countryOverview || zoom < PROVINCE_LABEL_ZOOM);
      if (visible && !map.hasLayer(label.marker)) label.marker.addTo(map);
      if (!visible && map.hasLayer(label.marker)) map.removeLayer(label.marker);
    });
  }

  function makeMapLabel(text, lngLat, className) {
    return L.marker([lngLat[1], lngLat[0]], {
      icon: L.divIcon({
        className: 'qm-label-icon ' + className,
        html: '<span>' + escapeHTML(text) + '</span>',
        iconSize: [1, 1],
        iconAnchor: [0, 0]
      }),
      interactive: false,
      keyboard: false,
      pane: 'qmLabels',
      zIndexOffset: -1000
    });
  }

  function shortProvinceName(name) {
    return String(name || '')
      .replace(/壮族自治区$/, '')
      .replace(/回族自治区$/, '')
      .replace(/维吾尔自治区$/, '')
      .replace(/自治区$/, '')
      .replace(/特别行政区$/, '')
      .replace(/省$/, '')
      .replace(/市$/, '');
  }

  function isMunicipality(name) {
    return /^(北京市|天津市|上海市|香港特别行政区|澳门特别行政区)$/.test(String(name || ''));
  }

  function loadMapMode() {
    try {
      return localStorage.getItem(LS_MAP_MODE) === 'simple' ? 'simple' : 'standard';
    } catch (error) {
      return 'standard';
    }
  }

  function loadClustering() {
    try { return localStorage.getItem(LS_CLUSTER) === 'on'; } catch (error) { return false; }
  }

  function setClustering(enabled, persist) {
    state.clusterEnabled = enabled;
    els.map.classList.toggle('map-clustering', enabled);
    els.clusterToggle.setAttribute('aria-checked', String(enabled));
    if (persist) {
      try { localStorage.setItem(LS_CLUSTER, enabled ? 'on' : 'off'); } catch (error) { /* 忽略 */ }
    }
    if (state.ready) renderMarkers(visibleMarkers());
  }

  function currentMinZoom() {
    return state.mapMode === 'simple' ? SIMPLE_MIN_ZOOM : MIN_ZOOM;
  }

  function currentMaxZoom() {
    return state.mapMode === 'simple' ? SIMPLE_MAX_ZOOM : MAX_ZOOM;
  }

  function applyMapMode(mode, persist) {
    collapseSpider();
    var next = mode === 'simple' ? 'simple' : 'standard';
    if (next === 'simple' && !provinceLayer) {
      next = 'standard';
      toast('省界底图数据未加载，暂时使用标准地图。');
    }
    state.mapMode = next;

    var simple = next === 'simple';
    if (simple) {
      if (tileLayer && map.hasLayer(tileLayer)) map.removeLayer(tileLayer);
      if (!worldLayer) buildWorldLayer();
      if (worldLayer && !map.hasLayer(worldLayer)) worldLayer.addTo(map);
      map.setMinZoom(SIMPLE_MIN_ZOOM);
      map.setMaxBounds(WORLD_BOUNDS);
      if (provinceLayer && !map.hasLayer(provinceLayer)) provinceLayer.addTo(map);
      map.getContainer().classList.add('map-simple');
      map.setMaxZoom(SIMPLE_MAX_ZOOM);
    } else {
      if (worldLayer && map.hasLayer(worldLayer)) map.removeLayer(worldLayer);
      syncCountryLabels(false, map.getZoom());
      map.setMaxBounds(null);
      map.setMinZoom(MIN_ZOOM);
      if (provinceLayer && map.hasLayer(provinceLayer)) map.removeLayer(provinceLayer);
      if (provinceLabelLayer && map.hasLayer(provinceLabelLayer)) map.removeLayer(provinceLabelLayer);
      if (cityLayer && map.hasLayer(cityLayer)) map.removeLayer(cityLayer);
      if (tileLayer && !map.hasLayer(tileLayer)) tileLayer.addTo(map);
      map.getContainer().classList.remove('map-simple');
      map.setMaxZoom(MAX_ZOOM);
    }

    if (map.getZoom() > currentMaxZoom()) map.setZoom(currentMaxZoom(), { animate: false });
    if (zoomRange) {
      zoomRange.min = String(currentMinZoom());
      zoomRange.max = String(currentMaxZoom());
    }
    syncZoomControl();
    updateMapModeButtons();
    syncSimpleLabels();
    if (state.ready && state.clusterEnabled) renderMarkers(visibleMarkers());

    if (persist) {
      try { localStorage.setItem(LS_MAP_MODE, state.mapMode); } catch (error) { /* 忽略 */ }
    }
  }

  function syncSimpleLabels() {
    if (!map || state.mapMode !== 'simple') return;
    var zoom = map.getZoom();
    var showCities = zoom >= CITY_LABEL_ZOOM;
    syncCountryLabels(true, zoom);

    if (showCities) {
      if (provinceLabelLayer && map.hasLayer(provinceLabelLayer)) map.removeLayer(provinceLabelLayer);
      if (cityLayer && !map.hasLayer(cityLayer)) cityLayer.addTo(map);
    } else {
      if (cityLayer && map.hasLayer(cityLayer)) map.removeLayer(cityLayer);
      if (zoom >= PROVINCE_LABEL_ZOOM && !map.hasLayer(provinceLabelLayer)) provinceLabelLayer.addTo(map);
      if (zoom < PROVINCE_LABEL_ZOOM && map.hasLayer(provinceLabelLayer)) map.removeLayer(provinceLabelLayer);
    }
  }

  function updateMapModeButtons() {
    if (!els.mapMode) return;
    var buttons = els.mapMode.querySelectorAll('button[data-map-mode]');
    for (var i = 0; i < buttons.length; i += 1) {
      var active = buttons[i].getAttribute('data-map-mode') === state.mapMode;
      buttons[i].setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }

  function isCompact() {
    return !!(compactQuery && compactQuery.matches);
  }

  function addZoomControl() {
    var container = L.DomUtil.create('div', 'qm-zoom');
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', '地图缩放');

    zoomInBtn = document.createElement('button');
    zoomInBtn.type = 'button';
    zoomInBtn.className = 'qm-zoom-btn';
    zoomInBtn.title = '放大';
    zoomInBtn.setAttribute('aria-label', '放大');
    zoomInBtn.textContent = '+';

    zoomOutBtn = document.createElement('button');
    zoomOutBtn.type = 'button';
    zoomOutBtn.className = 'qm-zoom-btn';
    zoomOutBtn.title = '缩小';
    zoomOutBtn.setAttribute('aria-label', '缩小');
    zoomOutBtn.textContent = '−';

    var slider = document.createElement('div');
    slider.className = 'qm-zoom-slider';

    var track = document.createElement('div');
    track.className = 'qm-zoom-track';
    track.setAttribute('aria-hidden', 'true');

    var fill = document.createElement('div');
    fill.className = 'qm-zoom-fill';
    fill.setAttribute('aria-hidden', 'true');

    var thumb = document.createElement('div');
    thumb.className = 'qm-zoom-thumb';
    thumb.setAttribute('aria-hidden', 'true');

    zoomRange = document.createElement('input');
    zoomRange.type = 'range';
    zoomRange.className = 'qm-zoom-range';
    zoomRange.min = String(MIN_ZOOM);
    zoomRange.max = String(MAX_ZOOM);
    zoomRange.step = '0.5';
    zoomRange.value = String(map.getZoom());
    zoomRange.setAttribute('aria-label', '缩放级别');

    slider.appendChild(track);
    slider.appendChild(fill);
    slider.appendChild(thumb);
    slider.appendChild(zoomRange);

    container.appendChild(zoomInBtn);
    container.appendChild(slider);
    container.appendChild(zoomOutBtn);

    var ZoomBar = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () { return container; }
    });
    new ZoomBar().addTo(map);
    zoomControlEl = container;

    zoomInBtn.addEventListener('click', function () { map.zoomIn(); });
    zoomOutBtn.addEventListener('click', function () { map.zoomOut(); });
    zoomRange.addEventListener('input', function () {
      var value = Number(zoomRange.value);
      if (isFinite(value)) map.setZoom(value, { animate: false });
    });

    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
    L.DomEvent.on(container, 'keydown', L.DomEvent.stopPropagation);

    map.on('zoom zoomend', function () {
      syncZoomControl();
      syncSimpleLabels();
    });
    syncZoomControl();
  }

  function syncZoomControl() {
    if (!zoomControlEl || !zoomRange) return;

    var zoom = map.getZoom();
    var maxZoom = currentMaxZoom();
    var minZoom = currentMinZoom();
    var ratio = (zoom - minZoom) / (maxZoom - minZoom);
    ratio = Math.max(0, Math.min(1, ratio));

    zoomControlEl.style.setProperty('--zoom-fill', ratio.toFixed(4));
    zoomRange.value = String(zoom);
    zoomRange.setAttribute('aria-valuenow', String(zoom));
    zoomRange.setAttribute('aria-valuetext', '缩放 ' + zoom + ' 级');
    zoomInBtn.disabled = zoom >= maxZoom;
    zoomOutBtn.disabled = zoom <= minZoom;
  }

  function onTileError() {
    state.tileErrors += 1;
    if (state.tileLoads === 0 && state.tileErrors === 8) {
      toast('底图加载失败，请检查网络连接。', 4000);
    }
  }

  function bindEvents() {
    els.pickBtn.addEventListener('click', function () {
      if (!state.ready) {
        toast('正在载入标记，请稍等一下。');
        return;
      }
      if (state.mode === 'error') {
        loadData();
        return;
      }
      openPicker();
    });

    els.closeSheet.addEventListener('click', closePicker);
    els.cancel.addEventListener('click', closePicker);
    els.pinForm.addEventListener('submit', onSave);
    els.name.addEventListener('input', onFormInput);
    els.emojiPicker.addEventListener('click', function (event) {
      var button = event.target && event.target.closest ? event.target.closest('.emoji-option') : null;
      if (!button) return;
      selectEmoji(button.getAttribute('data-emoji'));
    });

    var emojiButtons = els.emojiPicker.querySelectorAll('.emoji-option');
    for (var e = 0; e < emojiButtons.length; e += 1) {
      if (!emojiButtons[e].getAttribute('aria-label')) {
        emojiButtons[e].setAttribute('aria-label', emojiButtons[e].title || '选择头像');
      }
    }

    els.remove.addEventListener('click', onRemoveClick);
    els.avatarFile.addEventListener('change', onAvatarInput);
    els.clearAvatar.addEventListener('click', function () {
      state.avatar = '';
      els.avatarFile.value = '';
      syncAvatar();
    });
    els.duration.addEventListener('change', updateDuration);
    els.myMarkers.addEventListener('click', function () { openManage('mine'); });
    els.adminButton.addEventListener('click', function () { openManage('admin'); });
    els.closeManage.addEventListener('click', function () { els.manageDialog.close(); });
    els.adminForm.addEventListener('submit', onAdminLogin);
    els.adminRefresh.addEventListener('click', loadAdminMarkers);
    els.adminLogout.addEventListener('click', logoutAdmin);
    els.manageDialog.addEventListener('close', function () { els.adminPassword.value = ''; });
    window.addEventListener('storage', function (event) {
      if (event.key !== LS_MARKERS && event.key !== null) return;
      state.markers = sortMarkers(state.markers.filter(function (item) { return !item.local_only; }).concat(readLocal()));
      refreshUI();
    });

    map.on('click', function (event) {
      if (!state.picking) {
        collapseSpider();
        return;
      }
      if (state.saving) return;
      setTemp(event.latlng);
    });

    els.peopleToggle.addEventListener('click', function () {
      setPeopleOpen(!state.peopleOpen);
    });
    els.peopleClose.addEventListener('click', function () { setPeopleOpen(false); });
    els.peopleScrim.addEventListener('click', function () { setPeopleOpen(false); });
    els.clusterToggle.addEventListener('click', function () {
      setClustering(!state.clusterEnabled, true);
    });

    if (els.mapMode) {
      els.mapMode.addEventListener('click', function (event) {
        var button = event.target && event.target.closest
          ? event.target.closest('button[data-map-mode]')
          : null;
        if (!button) return;
        applyMapMode(button.getAttribute('data-map-mode'), true);
      });
    }

    els.peopleList.addEventListener('click', function (event) {
      var target = event.target;
      var button = target && target.closest ? target.closest('.person') : null;
      if (!button) return;
      focusPerson(button.getAttribute('data-id'), button.matches(':focus-visible'));
    });

    window.addEventListener('resize', function () {
      var compact = isCompact();
      if (compact === wasCompact) return;
      wasCompact = compact;
      setPeopleOpen(!compact);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || state.saving || els.manageDialog.open) return;

      if (personPopup && map.hasLayer(personPopup)) {
        event.preventDefault();
        event.stopPropagation();
        var trigger = popupTrigger;
        closePersonPopup();
        if (trigger && trigger.isConnected) trigger.focus({ preventScroll: true });
      } else if (spider) {
        event.preventDefault();
        event.stopPropagation();
        var focused = document.activeElement;
        collapseSpider(spider.layer.getElement().contains(focused) || spider.pins.some(function (pin) {
          return pin.button === focused;
        }));
      } else if (state.picking) {
        event.preventDefault();
        closePicker();
      } else if (state.peopleOpen) {
        setPeopleOpen(false);
      }
    }, true);
  }

  /* ---------- 数据 ---------- */

  async function loadData() {
    state.ready = false;
    setMode('loading');
    try {
      if (location.protocol === 'file:' || !API_BASE) {
        state.markers = readLocal();
        setMode('local');
      } else {
        var data = await readServerMarkers(false);
        state.admin = data.admin;
        if (API_BASE && !data.admin) setAdminToken('');
        state.markers = sortMarkers(data.markers.concat(readLocal()));
        setMode('shared');
      }
    } catch (error) {
      state.markers = readLocal();
      setMode(!API_BASE && error.status === 404 ? 'local' : 'error');
      if (state.mode === 'error') toast(error.message, 5000);
    } finally {
      state.ready = true;
      refreshUI();
    }
  }

  function setAdminToken(value) {
    state.adminToken = value;
    try {
      if (value) sessionStorage.setItem(SS_ADMIN, value);
      else sessionStorage.removeItem(SS_ADMIN);
    } catch (error) { /* 仅本次会话 */ }
  }

  async function requestApi(path, method, body) {
    var headers = { Accept: 'application/json' };
    if (state.ownerKey) headers['X-Owner-Key'] = state.ownerKey;
    if (API_BASE && state.adminToken) headers.Authorization = 'Bearer ' + state.adminToken;
    if (body) headers['Content-Type'] = 'application/json';
    var response;
    try {
      response = await fetch(path, {
        method: method, headers: headers, cache: "no-store", credentials: API_BASE ? 'omit' : 'same-origin',
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000)
      });
    } catch (error) {
      throw new Error('暂时连不上标记服务，请稍后重试。');
    }
    var data = await response.json().catch(function () { return null; });
    if (!response.ok || !data) {
      var error = new Error((data && data.error) || '标记服务暂时不可用。');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function readServerMarkers(adminView) {
    var next = '';
    var markers = [];
    var data;
    do {
      var params = new URLSearchParams();
      if (adminView) params.set('admin', '1');
      if (next) params.set('after', next);
      data = await requestApi(API_URL + '?' + params, 'GET');
      if (!Array.isArray(data.markers)) throw new Error('标记服务返回的数据格式有误。');
      markers = markers.concat(data.markers.map(normalizeMarker).filter(Boolean));
      next = data.next;
    } while (next);
    return { markers: sortMarkers(markers), admin: data.admin === true };
  }

  function getOwnerKey() {
    var key;
    try { key = localStorage.getItem(LS_OWNER); } catch (error) { /* 浏览器限制 */ }
    if (/^[a-f0-9]{64}$/.test(key)) return key;
    if (!window.crypto || !window.crypto.getRandomValues) return null;
    key = Array.from(window.crypto.getRandomValues(new Uint8Array(32)), function (byte) {
      return byte.toString(16).padStart(2, '0');
    }).join('');
    try { localStorage.setItem(LS_OWNER, key); } catch (error) { /* 仅本次会话 */ }
    return key;
  }

  function normalizeMarker(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var id = typeof raw.id === 'string' ? raw.id.trim() : '';
    var name = typeof raw.name === 'string' ? raw.name.trim() : '';
    var avatar = typeof raw.avatar_url === 'string' ? raw.avatar_url : '';
    if (!id || id.startsWith('seed-') || !name) return null;
    if (!Number.isFinite(raw.lat) || !Number.isFinite(raw.lng)) return null;
    if (Math.abs(raw.lat) > 90 || Math.abs(raw.lng) > 180) return null;
    if (!AVATAR_PATTERN.test(avatar) && !/^https?:\/\//i.test(avatar)) avatar = '';
    return {
      id: id,
      name: Array.from(name).slice(0, NAME_MAX).join(''),
      emoji: normalizeEmoji(raw.emoji),
      avatar_url: avatar,
      lat: fuzz(raw.lat),
      lng: fuzz(raw.lng),
      created_at: typeof raw.created_at === 'string' ? raw.created_at : new Date(0).toISOString(),
      expires_at: Number.isFinite(Date.parse(raw.expires_at)) ? raw.expires_at : null,
      is_mine: raw.is_mine === true,
      local_only: raw.local_only === true
    };
  }

  function sortMarkers(list) {
    return list.slice().sort(function (a, b) {
      return (Date.parse(a.created_at) - Date.parse(b.created_at)) || a.id.localeCompare(b.id);
    });
  }

  function readLocal() {
    try {
      var raw = JSON.parse(localStorage.getItem(LS_MARKERS) || '[]');
      if (!Array.isArray(raw)) return [];
      var byId = new Map();
      raw.map(normalizeMarker).filter(Boolean).forEach(function (marker) {
        marker.local_only = true;
        marker.is_mine = true;
        byId.set(marker.id, marker);
      });
      return sortMarkers(Array.from(byId.values()));
    } catch (error) {
      return [];
    }
  }

  function saveLocal(record, id) {
    var local = readLocal().filter(function (marker) { return marker.id !== id; });
    if (record) local.push(record);
    try {
      localStorage.setItem(LS_MARKERS, JSON.stringify(local));
    } catch (error) {
      throw new Error('浏览器无法保存标记。请检查存储设置，或尝试使用较小的头像。');
    }
  }

  function isExpired(marker) {
    return marker.expires_at && Date.parse(marker.expires_at) <= Date.now();
  }

  function visibleMarkers() {
    return state.markers.filter(function (marker) { return !isExpired(marker); });
  }

  function refreshUI() {
    var visible = visibleMarkers();
    renderMarkers(visible);
    renderPeople(visible);
    updateStats(visible.length);
    if (els.manageDialog.open) renderManage();
    clearTimeout(expiryTimer);
    var expiration = visible.reduce(function (next, marker) {
      return marker.expires_at ? Math.min(next, Date.parse(marker.expires_at)) : next;
    }, Infinity);
    if (Number.isFinite(expiration)) {
      expiryTimer = setTimeout(refreshUI, Math.min(2147483647, Math.max(1, expiration - Date.now())));
    }
  }

  /* ---------- 渲染 ---------- */

  function renderMarkers(visible) {
    collapseSpider();
    markerLayer.clearLayers();
    markerIndex.clear();
    hoveredPin = null;
    highlightedPin = null;
    var groups = state.clusterEnabled ? groupMarkers(visible) : visible.map(function (item) {
      return { items: [item], anchor: L.latLng(item.lat, item.lng) };
    });
    renderedMarkers = groups.map(function (group) {
      var entry = group.items.length === 1
        ? addPersonPin(group.items[0], group.anchor, markerLayer, 0)
        : addClusterPin(group);
      group.entry = entry;
      group.items.forEach(function (item) { markerIndex.set(item.id, group); });
      return entry;
    });

    if (state.pulseId !== null) {
      var group = markerIndex.get(state.pulseId);
      if (group) pulseMarker(group.entry.layer);
      state.pulseId = null;
    }
    queueMarkerLayout();
  }

  function groupMarkers(items) {
    var zoom = map.getZoom();
    var progress = (zoom - currentMinZoom()) / (currentMaxZoom() - currentMinZoom());
    var radius = Math.max(CLUSTER_MIN_RADIUS, CLUSTER_RADIUS - (isCompact() ? 5 : 0) -
      (CLUSTER_RADIUS - CLUSTER_MIN_RADIUS) * progress);
    var radiusSquared = radius * radius;
    var cells = new Map();
    var points = new Map();

    // 截到同一屏幕像素的标记共用一个点，避免重复比较同坐标用户。
    items.forEach(function (item) {
      var pixel = map.project([item.lat, item.lng], zoom).round();
      var key = pixel.x + ':' + pixel.y;
      var point = points.get(key);
      if (!point) {
        point = { pixel: pixel, items: [], parent: null };
        points.set(key, point);
      }
      point.items.push(item);
    });

    function rootOf(point) {
      while (point.parent) {
        if (point.parent.parent) point.parent = point.parent.parent;
        point = point.parent;
      }
      return point;
    }

    points.forEach(function (point) {
      var x = Math.floor(point.pixel.x / radius);
      var y = Math.floor(point.pixel.y / radius);
      for (var dx = -1; dx <= 1; dx += 1) {
        for (var dy = -1; dy <= 1; dy += 1) {
          var neighbors = cells.get((x + dx) + ':' + (y + dy)) || [];
          neighbors.forEach(function (neighbor) {
            var deltaX = point.pixel.x - neighbor.pixel.x;
            var deltaY = point.pixel.y - neighbor.pixel.y;
            if (deltaX * deltaX + deltaY * deltaY > radiusSquared) return;
            var root = rootOf(neighbor);
            var current = rootOf(point);
            if (root !== current) current.parent = root;
          });
        }
      }
      var key = x + ':' + y;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(point);
    });

    var groups = new Map();
    points.forEach(function (point) {
      var root = rootOf(point);
      if (!groups.has(root)) groups.set(root, { items: [], points: [], sum: L.point(0, 0) });
      var group = groups.get(root);
      point.items.forEach(function (item) { group.items.push(item); });
      group.points.push(point);
      group.sum = group.sum.add(point.pixel.multiplyBy(point.items.length));
    });

    return Array.from(groups.values(), function (group) {
      var center = group.sum.divideBy(group.items.length);
      var anchor = group.points.reduce(function (best, point) {
        return point.pixel.distanceTo(center) < best.pixel.distanceTo(center) ? point : best;
      });
      // 选最靠近人群中心的真实位置，避免平均坐标上的气泡遮挡另一个簇。
      return { items: group.items, anchor: L.latLng(anchor.items[0].lat, anchor.items[0].lng) };
    });
  }

  function mapButton(className, text, label) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = text;
    button.setAttribute('aria-label', label);
    L.DomEvent.disableClickPropagation(button);
    return button;
  }

  function addPersonPin(item, position, layerGroup, zIndex) {
    var pin = buildPin(item.name, item.emoji, item.avatar_url, false);
    var button = mapButton('qm-avatar-button', '', '查看 ' + item.name + ' 的标记资料');
    var label = pin.querySelector('.qm-name');
    button.appendChild(pin.firstElementChild);
    pin.prepend(button);
    var layer = L.marker(position, {
      icon: buildIcon(pin, 'qm-person-icon'),
      interactive: false,
      keyboard: false,
      zIndexOffset: zIndex
    }).addTo(layerGroup);
    var entry = { item: item, layer: layer, button: button, label: label, zIndex: zIndex, size: AVATAR_RADIUS };

    button.addEventListener('click', function () {
      if (!state.picking) openPersonPopup(entry);
    });
    button.addEventListener('pointerenter', function (event) {
      if (event.pointerType === 'touch') return;
      hoveredPin = entry;
      queueMarkerLayout();
    });
    button.addEventListener('pointerleave', function () {
      if (hoveredPin === entry) hoveredPin = null;
      queueMarkerLayout();
    });
    button.addEventListener('focus', queueMarkerLayout);
    button.addEventListener('blur', queueMarkerLayout);
    return entry;
  }

  function addClusterPin(group) {
    var count = group.items.length;
    var button = mapButton('qm-cluster-button', String(count), '展开 ' + count + ' 位群友');
    button.setAttribute('aria-expanded', 'false');
    var layer = L.marker(group.anchor, {
      icon: L.divIcon({ className: 'qm-icon qm-cluster-icon', html: button, iconSize: [44, 44], iconAnchor: [22, 42] }),
      interactive: false,
      keyboard: false
    }).addTo(markerLayer);
    button.addEventListener('click', function () {
      if (!state.picking) expandSpider(group, 0, null, button.matches(':focus-visible'));
    });
    return { layer: layer, button: button, size: 22 };
  }

  function spiderViewport() {
    var size = map.getSize();
    var sidebar = state.peopleOpen && !isCompact() ? els.peoplePanel.getBoundingClientRect().right : 0;
    var ringSize = 2 * (SPIDER_PAGED_MIN_RADIUS + AVATAR_RADIUS);
    var verticalPadding = Math.max(8, (size.y - ringSize) / 2);
    var rightPadding = Math.min(62, Math.max(12, size.x - ringSize - 12));
    return L.bounds(
      [sidebar + 12, Math.min(isCompact() ? 112 : 86, verticalPadding)],
      [size.x - rightPadding, size.y - Math.min(106, verticalPadding)]
    );
  }

  function expandSpider(group, page, selectedId, moveFocus) {
    collapseSpider();
    var viewport = spiderViewport();
    var maxRadius = Math.max(30, Math.min(isCompact() ? 110 : 145,
      Math.min(viewport.getSize().x, viewport.getSize().y) / 2 - AVATAR_RADIUS));
    var capacity = Math.min(12, Math.floor(Math.PI / Math.asin(SPIDER_SPACING / (2 * maxRadius))));
    var pages = Math.ceil(group.items.length / capacity);
    var selectedIndex = selectedId === null ? -1 : group.items.findIndex(function (item) { return item.id === selectedId; });
    if (selectedIndex >= 0) page = Math.floor(selectedIndex / capacity);
    var items = group.items.slice(page * capacity, (page + 1) * capacity);
    var minRadius = pages > 1 ? SPIDER_PAGED_MIN_RADIUS : 70;
    var radius = Math.min(maxRadius, Math.max(minRadius, SPIDER_SPACING / (2 * Math.sin(Math.PI / Math.max(2, items.length)))));
    var center = map.latLngToContainerPoint(group.anchor).subtract([0, AVATAR_RADIUS]);
    var size = map.getSize();
    if (size.y <= 430 && isCompact()) {
      var toolbarEdge = els.mapMode.getBoundingClientRect().right;
      center.x = Math.max(size.x / 2 + 18, toolbarEdge + radius * .8 + AVATAR_RADIUS);
    }
    var inset = radius + AVATAR_RADIUS;
    var centerBounds = L.bounds(viewport.min.add([inset, inset]), viewport.max.subtract([inset, inset]));
    center.x = Math.max(centerBounds.min.x, Math.min(center.x, centerBounds.max.x));
    center.y = Math.max(centerBounds.min.y, Math.min(center.y, centerBounds.max.y));

    var controls = document.createElement('div');
    controls.className = 'qm-spider-controls';
    var close = mapButton('qm-cluster-button qm-spider-close', '×', '收起 ' + group.items.length + ' 位群友');
    controls.appendChild(close);
    close.addEventListener('click', function () { collapseSpider(close.matches(':focus-visible')); });
    var next = null;
    if (pages > 1) {
      next = mapButton('qm-spider-next', (page + 1) + ' / ' + pages + ' ›',
        '显示下一页群友，当前第 ' + (page + 1) + ' 页，共 ' + pages + ' 页');
      controls.appendChild(next);
      next.addEventListener('click', function () {
        var restore = next.matches(':focus-visible');
        expandSpider(group, (page + 1) % pages, null, false);
        if (restore) spider.layer.getElement().querySelector('.qm-spider-next').focus({ preventScroll: true });
      });
    }
    var controlLayer = L.marker(map.containerPointToLatLng(center), {
      icon: L.divIcon({ className: 'qm-icon qm-spider-icon', html: controls, iconSize: [80, 40], iconAnchor: [40, 18] }),
      interactive: false,
      keyboard: false,
      zIndexOffset: 1000
    }).addTo(spiderLayer);

    var pins = items.map(function (item, index) {
      var angle = (index / items.length) * 2 * Math.PI - Math.PI / (items.length === 2 ? 4 : 2);
      var position = map.containerPointToLatLng(center.add([Math.cos(angle) * radius, Math.sin(angle) * radius + AVATAR_RADIUS]));
      L.polyline([[item.lat, item.lng], position], {
        color: '#466786', weight: 1.5, opacity: .76, dashArray: '4 3', interactive: false
      }).addTo(spiderLayer);
      return addPersonPin(item, position, spiderLayer, 1000);
    });
    spider = { group: group, pins: pins, layer: controlLayer };
    document.body.classList.add('spider-open');
    group.entry.button.setAttribute('aria-expanded', 'true');
    queueMarkerLayout();
    if (moveFocus) pins[0].button.focus({ preventScroll: true });
    return pins.find(function (pin) { return pin.item.id === selectedId; });
  }

  function collapseSpider(restoreFocus) {
    closePersonPopup();
    if (!spider) return;
    var entry = spider.group.entry;
    if (spider.pins.includes(hoveredPin)) hoveredPin = null;
    if (spider.pins.includes(highlightedPin)) highlightedPin = null;
    spiderLayer.clearLayers();
    spider = null;
    document.body.classList.remove('spider-open');
    entry.button.setAttribute('aria-expanded', 'false');
    entry.layer.getElement().classList.remove('is-obscured');
    if (restoreFocus) entry.button.focus({ preventScroll: true });
    queueMarkerLayout();
  }

  function closePersonPopup() {
    if (personPopup) map.closePopup(personPopup);
    personPopup = null;
    popupTrigger = null;
  }

  function openPersonPopup(entry) {
    var item = entry.item;
    var detail = document.createElement('div');
    detail.className = 'qm-person-detail';
    detail.appendChild(buildAvatar(item.name, item.emoji, item.avatar_url));
    var body = document.createElement('div');
    detail.appendChild(body);
    var name = document.createElement('strong');
    name.textContent = item.name;
    body.appendChild(name);
    var coords = document.createElement('div');
    coords.className = 'qm-person-coords';
    coords.textContent = formatLat(item.lat) + ' · ' + formatLng(item.lng);
    body.appendChild(coords);
    detail.tabIndex = -1;
    detail.setAttribute('role', 'group');
    detail.setAttribute('aria-label', item.name + '，' + coords.textContent);
    var moveFocus = entry.button.matches(':focus-visible');
    closePersonPopup();
    popupTrigger = entry.button;
    personPopup = L.popup({ className: 'qm-person-popup', offset: [0, -43], maxWidth: 245 })
      .setLatLng(entry.layer.getLatLng()).setContent(detail).openOn(map);
    if (moveFocus) detail.focus({ preventScroll: true });
  }

  function markerBox(entry) {
    var center = map.latLngToContainerPoint(entry.layer.getLatLng()).subtract([0, AVATAR_RADIUS]);
    return L.bounds(center.subtract([entry.size, entry.size]), center.add([entry.size, entry.size]));
  }

  function queueMarkerLayout() {
    if (!markerFrame) markerFrame = requestAnimationFrame(layoutMarkers);
  }

  function layoutMarkers() {
    markerFrame = 0;
    if (!state.clusterEnabled) {
      renderedMarkers.forEach(function (entry) { entry.button.disabled = state.picking; });
      return;
    }
    var viewport = L.bounds([4, 4], map.getSize().subtract([4, 4]));
    var spiderPins = spider ? spider.pins : [];
    var expandedBoxes = spiderPins.map(markerBox);
    if (spider) {
      spider.layer.getElement().querySelectorAll('button').forEach(function (button) {
        var rect = button.getBoundingClientRect();
        expandedBoxes.push(L.bounds([rect.left, rect.top], [rect.right, rect.bottom]));
      });
    }
    var blocked = expandedBoxes.slice();
    var labels = [];
    renderedMarkers.concat(spiderPins).forEach(function (entry) {
      var box = markerBox(entry);
      var obscured = spider && (entry === spider.group.entry ||
        (!spiderPins.includes(entry) && expandedBoxes.some(function (other) { return other.overlaps(box); })));
      entry.layer.getElement().classList.toggle('is-obscured', Boolean(obscured));
      entry.button.disabled = state.picking;
      if (!obscured && viewport.intersects(box) && !spiderPins.includes(entry)) blocked.push(box);
      if (!entry.label) return;

      var active = !obscured && (entry === hoveredPin || entry === highlightedPin || entry.button.matches(':focus-visible'));
      var priority = entry.zIndex ? 1 : 0;
      if (active) priority = entry === hoveredPin ? 3 : 2;
      var zIndex = entry.zIndex + (active ? priority * 10000 : 0);
      if (entry.layer.options.zIndexOffset !== zIndex) entry.layer.setZIndexOffset(zIndex);
      entry.button.classList.toggle('is-emphasized', active);
      if (!obscured && viewport.intersects(box)) {
        labels.push({ label: entry.label, center: box.getCenter(), priority: priority });
      } else {
        entry.label.removeAttribute('data-placement');
      }
    });

    var width = map.getSize().x;
    var overlays = [document.querySelector('.brand'), state.peopleOpen ? els.peoplePanel : els.peopleToggle,
      els.mapMode, zoomControlEl, state.picking ? els.sheet : els.ctaWrap];
    overlays.forEach(function (element) {
      if (!element || element.hidden || getComputedStyle(element).visibility === 'hidden' ||
        (element === els.peoplePanel && isCompact()) ||
        (element === els.peopleToggle && !element.classList.contains('is-visible'))) return;
      var rect = element.getBoundingClientRect();
      if (rect.width && rect.right > 0 && rect.left < width) {
        blocked.push(L.bounds([rect.left, rect.top], [rect.right, rect.bottom]));
      }
    });

    labels.sort(function (a, b) { return b.priority - a.priority; }).forEach(function (entry) {
      var label = entry.label;
      var center = entry.center;
      var w = label.offsetWidth;
      var h = label.offsetHeight;
      var gap = AVATAR_RADIUS + 5;
      var candidates = [
        ['below', center.x - w / 2, center.y + gap],
        ['above', center.x - w / 2, center.y - gap - h],
        ['right', center.x + gap, center.y - h / 2],
        ['left', center.x - gap - w, center.y - h / 2]
      ];
      var placement = candidates.find(function (candidate) {
        var x = candidate[1];
        var y = candidate[2];
        var box = L.bounds([x - 2, y - 2], [x + w + 2, y + h + 2]);
        if (!viewport.contains(box) || blocked.some(function (other) { return other.overlaps(box); })) return false;
        blocked.push(box);
        return true;
      });
      if (placement) label.setAttribute('data-placement', placement[0]);
      else label.removeAttribute('data-placement');
    });
  }

  function renderPeople(visible) {
    if (!els.peopleList) return;

    var existing = Object.create(null);
    var children = els.peopleList.children;
    var i;

    for (i = 0; i < children.length; i += 1) {
      var button = children[i].querySelector('.person');
      if (button) existing[button.getAttribute('data-id')] = children[i];
    }

    visible.forEach(function (item) {
      var li = existing[item.id];
      var button;

      if (!li) {
        li = document.createElement('li');
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'person';
        button.setAttribute('data-id', item.id);
        button.setAttribute('data-name', item.name);
        button.setAttribute('data-avatar', item.avatar_url || '');
        button.setAttribute('data-emoji', item.emoji || '');
        button.appendChild(buildAvatar(item.name, item.emoji, item.avatar_url));

        var name = document.createElement('span');
        name.className = 'person-name';
        name.textContent = item.name;
        button.appendChild(name);

        var go = document.createElement('span');
        go.className = 'person-go';
        go.setAttribute('aria-hidden', 'true');
        go.textContent = '›';
        button.appendChild(go);

        li.appendChild(button);
      } else {
        delete existing[item.id];
        button = li.querySelector('.person');
      }

      button.setAttribute('aria-label', '定位到 ' + item.name);
      button.classList.toggle('is-mine', item.is_mine);

      var nameEl = button.querySelector('.person-name');
      if (nameEl && nameEl.textContent !== item.name) nameEl.textContent = item.name;

      var avatarChanged = button.getAttribute('data-name') !== item.name ||
        button.getAttribute('data-avatar') !== (item.avatar_url || '') ||
        button.getAttribute('data-emoji') !== (item.emoji || '');

      if (avatarChanged) {
        var oldAvatar = button.querySelector('.qm-avatar');
        if (oldAvatar) oldAvatar.remove();
        button.insertBefore(buildAvatar(item.name, item.emoji, item.avatar_url), button.firstChild);
        button.setAttribute('data-name', item.name);
        button.setAttribute('data-avatar', item.avatar_url || '');
        button.setAttribute('data-emoji', item.emoji || '');
      }

      els.peopleList.appendChild(li);
    });

    Object.keys(existing).forEach(function (id) {
      var li = existing[id];
      if (li && li.parentNode) li.parentNode.removeChild(li);
    });

    els.peopleCount.textContent = String(visible.length);
    els.peopleToggleCount.textContent = String(visible.length);
    els.peopleEmpty.hidden = visible.length > 0;
  }

  function setPeopleOpen(open) {
    var compact = isCompact();
    var next = !!open;

    state.peopleOpen = next;
    els.peoplePanel.classList.toggle('is-open', compact && next);
    els.peoplePanel.classList.toggle('is-collapsed', !compact && !next);
    els.peopleScrim.hidden = !(compact && next);
    els.peopleToggle.classList.toggle('is-visible', !next);
    els.peopleToggle.setAttribute('aria-expanded', next ? 'true' : 'false');
    document.body.classList.toggle('people-open', compact && next);
    collapseSpider();
    queueMarkerLayout();
  }

  function focusPerson(id, moveFocus) {
    var group = markerIndex.get(id);
    var item = group && group.items.find(function (person) { return person.id === id; });
    if (!item) return;

    if (isCompact() && state.peopleOpen) setPeopleOpen(false);
    collapseSpider();
    map.stop();
    pendingPerson = { id: id, moveFocus: moveFocus };
    var animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    map.flyTo([item.lat, item.lng], Math.min(currentMaxZoom(), Math.max(map.getZoom(), 9)), {
      duration: .8, animate: animate
    });
  }

  function revealPerson(selection) {
    var group = markerIndex.get(selection.id);
    if (!group || state.picking) return;
    var entry = group.items.length === 1 ? group.entry : expandSpider(group, 0, selection.id, false);
    var pin = entry.layer.getElement().querySelector('.qm-pin');
    if (!pin) return;

    highlightedPin = entry;
    if (selection.moveFocus) entry.button.focus({ preventScroll: true });
    queueMarkerLayout();
    clearTimeout(focusTimer);
    pin.classList.remove('is-focus');
    void pin.offsetWidth;
    pin.classList.add('is-focus');
    focusTimer = setTimeout(function () {
      pin.classList.remove('is-focus');
      if (highlightedPin === entry) highlightedPin = null;
      queueMarkerLayout();
    }, 1600);
  }

  function pulseMarker(marker) {
    var element = marker.getElement();
    if (!element) return;
    var pin = element.querySelector('.qm-pin, .qm-cluster-button');
    if (!pin) return;

    pin.classList.add('is-new');
    setTimeout(function () { pin.classList.remove('is-new'); }, 1500);
  }

  function buildIcon(pin, className) {
    return L.divIcon({
      className: className ? 'qm-icon ' + className : 'qm-icon',
      html: pin,
      iconSize: [136, 76],
      iconAnchor: [68, 40]
    });
  }

  function buildTempIcon() {
    return buildIcon(buildPin(els.name.value.trim(), state.emoji, state.avatar, true));
  }

  function buildPin(name, emoji, avatarUrl, isTemp) {
    var pin = document.createElement('div');
    pin.className = 'qm-pin' + (isTemp ? ' is-temp' : '');

    pin.appendChild(buildAvatar(name, emoji, avatarUrl));

    var label = document.createElement('span');
    label.className = 'qm-name';
    label.textContent = name || '你的位置';
    pin.appendChild(label);

    return pin;
  }

  function buildAvatar(name, emoji, avatarUrl) {
    var avatar = document.createElement('span');
    avatar.className = 'qm-avatar';
    avatar.style.setProperty('--tone', String(hueOf(name)));

    if (emoji && EMOJI_SET.has(emoji)) {
      avatar.classList.add('has-emoji');
      var emojiEl = document.createElement('span');
      emojiEl.className = 'qm-emoji';
      emojiEl.setAttribute('aria-hidden', 'true');
      emojiEl.textContent = emoji;
      avatar.appendChild(emojiEl);
      return avatar;
    }

    var initial = document.createElement('span');
    initial.className = 'qm-initial';
    initial.textContent = Array.from(name || '✦')[0] || '✦';
    avatar.appendChild(initial);

    if (avatarUrl && (AVATAR_PATTERN.test(avatarUrl) || /^https?:\/\//i.test(avatarUrl))) {
      var img = document.createElement('img');
      img.className = 'qm-avatar-img';
      img.alt = '';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', function () { img.remove(); });
      img.src = avatarUrl;
      avatar.appendChild(img);
    }

    return avatar;
  }

  function hueOf(name) {
    var text = String(name || '?');
    var sum = 0;
    for (var i = 0; i < text.length; i += 1) {
      sum += text.codePointAt(i);
      if (text.codePointAt(i) > 0xffff) i += 1;
    }
    return sum % 360;
  }

  function updateStats(count) {
    els.count.textContent = count > 0 ? count + ' 处标记' : '还没有人标记';
  }

  function setMode(mode) {
    state.mode = mode;
    var modes = {
      loading: ['连接中', '正在读取群友标记'],
      error: ['服务未连接', '点底部按钮重试连接'],
      local: ['本地预览', '标记只保存在当前浏览器'],
      shared: ['共享模式', '所有访客都能看到未到期的共享标记']
    };
    els.mode.textContent = modes[mode][0];
    els.mode.title = modes[mode][1];
    els.mode.classList.toggle('is-shared', mode === 'shared');
    els.pickLabel.textContent = mode === 'error' ? '重试连接' : '标记我的位置';
  }

  /* ---------- 选点 ---------- */

  function openPicker(existing) {
    if (state.picking) return;

    collapseSpider();
    state.picking = true;
    state.editing = existing || null;
    state.removeArmed = false;
    resetRemoveLabel();
    els.formError.textContent = '';
    els.name.value = existing ? existing.name : '';
    state.emoji = existing ? normalizeEmoji(existing.emoji) : '';
    state.avatar = existing ? existing.avatar_url : '';
    els.avatarFile.value = '';
    state.avatarLoading = false;
    state.avatarRequest += 1;
    els.duration.options[0].hidden = !existing;
    els.duration.value = existing ? 'keep' : 'long';
    els.durationDays.value = '';
    updateDuration();
    syncAvatar();
    els.remove.hidden = !existing;

    els.sheetTitle.textContent = existing ? '编辑标记' : '标记我的位置';
    els.sheetSub.textContent = existing
      ? '拖动头像或点击地图，换个地方'
      : '点击地图选点，或拖动头像微调';
    els.save.textContent = existing ? '保存修改' : '保存';
    els.note.textContent = state.mode === 'shared' && !(existing && existing.local_only)
      ? '访客可见昵称、头像及约 1 公里精度的位置。'
      : '坐标会自动模糊到约 1 公里。';

    setTemp(existing ? L.latLng(existing.lat, existing.lng) : map.getCenter());

    if (existing) {
      map.setView([existing.lat, existing.lng], Math.min(currentMaxZoom(), Math.max(map.getZoom(), 11)), { animate: true });
    }

    els.sheet.hidden = false;
    els.pickHint.hidden = false;
    els.ctaWrap.classList.add('is-hidden');
    document.body.classList.add('picking');
    document.body.classList.add('sheet-open');
    queueMarkerLayout();

    if (!window.matchMedia || !window.matchMedia('(pointer: coarse)').matches) {
      setTimeout(function () { els.name.focus({ preventScroll: true }); }, 80);
    }
  }

  function closePicker() {
    if (!state.picking || state.saving) return;

    state.picking = false;
    state.editing = null;
    state.tempLatLng = null;
    state.avatarRequest += 1;
    state.avatarLoading = false;
    state.removeArmed = false;
    clearTimeout(removeTimer);
    resetRemoveLabel();

    if (tempMarker) {
      map.removeLayer(tempMarker);
      tempMarker = null;
    }

    els.sheet.hidden = true;
    els.pickHint.hidden = true;
    els.ctaWrap.classList.remove('is-hidden');
    document.body.classList.remove('picking');
    document.body.classList.remove('sheet-open');
    queueMarkerLayout();

    if (!state.saving) {
      els.pickBtn.focus({ preventScroll: true });
    }
  }

  function setTemp(latlng) {
    state.tempLatLng = L.latLng(latlng.lat, latlng.lng);

    if (!tempMarker) {
      tempMarker = L.marker(state.tempLatLng, {
        icon: buildTempIcon(),
        draggable: true,
        autoPan: true,
        keyboard: false,
        zIndexOffset: 1000
      });

      tempMarker.on('drag', function () {
        state.tempLatLng = tempMarker.getLatLng();
        updateCoord();
      });

      tempMarker.addTo(map);
    } else {
      tempMarker.setLatLng(state.tempLatLng);
    }

    updateCoord();
  }

  function updateCoord() {
    if (!state.tempLatLng) {
      els.coord.textContent = '尚未选点';
      return;
    }

    var lat = fuzz(state.tempLatLng.lat);
    var lng = fuzz(state.tempLatLng.lng);

    els.coord.textContent = formatLat(lat) + ' · ' + formatLng(lng);
  }

  function formatLat(value) {
    return Math.abs(value).toFixed(2) + '°' + (value >= 0 ? 'N' : 'S');
  }

  function formatLng(value) {
    return Math.abs(value).toFixed(2) + '°' + (value >= 0 ? 'E' : 'W');
  }

  function onFormInput() {
    els.formError.textContent = '';
    syncPreview();
    scheduleTempRefresh();
  }

  function syncPreview() {
    var name = els.name.value.trim();
    els.preview.replaceChildren(buildAvatar(name || '你', state.emoji, state.avatar));
  }

  function applyEmojiSelection() {
    if (!els.emojiPicker) return;
    var buttons = els.emojiPicker.querySelectorAll('.emoji-option');
    for (var i = 0; i < buttons.length; i += 1) {
      var selected = !state.avatar && normalizeEmoji(buttons[i].getAttribute('data-emoji')) === state.emoji;
      buttons[i].classList.toggle('is-selected', selected);
      buttons[i].setAttribute('aria-pressed', selected ? 'true' : 'false');
    }
  }

  function selectEmoji(value) {
    if (state.avatarLoading) return;
    state.emoji = normalizeEmoji(value);
    state.avatar = '';
    els.avatarFile.value = '';
    els.formError.textContent = '';
    syncAvatar();
  }

  function syncAvatar() {
    els.clearAvatar.hidden = !state.avatar;
    els.clearAvatar.disabled = state.avatarLoading;
    els.avatarStatus.textContent = state.avatarLoading ? '正在处理图片…' :
      (state.avatar ? '已选择照片头像' : '也可以选择上方的 emoji');
    els.save.disabled = state.avatarLoading || state.saving;
    applyEmojiSelection();
    syncPreview();
    scheduleTempRefresh();
  }

  async function onAvatarInput() {
    var file = els.avatarFile.files[0];
    if (!file) return;
    var request = ++state.avatarRequest;
    state.avatarLoading = true;
    els.formError.textContent = '';
    syncAvatar();
    try {
      var avatar = await compressAvatar(file);
      if (request !== state.avatarRequest) return;
      state.avatar = avatar;
      state.emoji = '';
    } catch (error) {
      if (request !== state.avatarRequest) return;
      els.avatarFile.value = '';
      els.formError.textContent = error.message;
    } finally {
      if (request === state.avatarRequest) {
        state.avatarLoading = false;
        syncAvatar();
      }
    }
  }

  async function compressAvatar(file) {
    if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(file.type) || file.size > 12 * 1024 * 1024) {
      throw new Error('请选择 12 MB 以内的 JPG、PNG、WebP、GIF 或 AVIF 图片。');
    }
    var objectUrl = URL.createObjectURL(file);
    try {
      var image = new Image();
      image.src = objectUrl;
      await image.decode();
      var canvas = document.createElement('canvas');
      canvas.width = canvas.height = Math.min(144, image.naturalWidth, image.naturalHeight);
      var context = canvas.getContext('2d');
      var size = Math.min(image.naturalWidth, image.naturalHeight);
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2,
        size, size, 0, 0, canvas.width, canvas.height);
      for (var quality = .85; quality >= .3; quality -= .15) {
        var data = canvas.toDataURL('image/jpeg', quality);
        if (AVATAR_PATTERN.test(data) && data.length <= 24023) return data;
      }
    } catch (error) {
      throw new Error('无法读取这张图片，请换一张试试。');
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
    throw new Error('头像压缩后仍然太大，请换一张图片。');
  }

  function updateDuration() {
    els.durationDaysField.hidden = els.duration.value !== 'days';
    els.durationDays.required = els.duration.value === 'days';
  }

  function scheduleTempRefresh() {
    clearTimeout(tempRefreshTimer);
    tempRefreshTimer = setTimeout(function () {
      if (!tempMarker) return;
      tempMarker.setIcon(buildTempIcon());
    }, 140);
  }

  /* ---------- 保存 ---------- */

  async function onSave(event) {
    event.preventDefault();
    if (!state.picking || state.saving || state.avatarLoading) return;
    var name = els.name.value.trim().replace(/\s+/g, ' ');
    var editing = state.editing;
    var local = state.mode === 'local' || Boolean(editing && editing.local_only);
    var latlng = state.tempLatLng && state.tempLatLng.wrap();
    var days = els.duration.value === 'days' ? els.durationDays.valueAsNumber : null;
    var error = !name ? '名字不能为空。' : '';
    if (Array.from(name).length > NAME_MAX) error = '名字最多 16 个字符。';
    if (!latlng || Math.abs(latlng.lat) > 90 || Math.abs(latlng.lng) > 180) {
      error = '请先在地图上选一个有效位置。';
    }
    if (els.duration.value === 'days' && (!Number.isInteger(days) || days < 1 || days > 3650)) {
      error = '请输入 1 到 3650 的整数天数。';
    }
    if (error) {
      els.formError.textContent = error;
      return;
    }

    var payload = {
      name: name, emoji: state.emoji, avatar_url: state.avatar,
      lat: fuzz(latlng.lat), lng: fuzz(latlng.lng)
    };
    if (els.duration.value !== 'keep') payload.duration_days = days;
    if (editing) payload.id = editing.id;

    setSaving(true);
    try {
      var record;
      if (local) {
        record = {
          id: editing ? editing.id : newId(),
          name: payload.name, emoji: payload.emoji, avatar_url: payload.avatar_url,
          lat: payload.lat, lng: payload.lng,
          created_at: editing ? editing.created_at : new Date().toISOString(),
          expires_at: els.duration.value === 'keep' && editing ? editing.expires_at :
            (days === null ? null : new Date(Date.now() + days * 86400000).toISOString()),
          is_mine: true, local_only: true
        };
        saveLocal(record, record.id);
      } else {
        var data = await requestApi(API_URL, editing ? 'PATCH' : 'POST', payload);
        record = normalizeMarker(data.marker);
        if (!record) throw new Error('标记服务返回的数据格式有误。');
      }
      state.markers = changeMarkers(state.markers, record.id, record);
      if (state.admin && !local) state.adminMarkers = changeMarkers(state.adminMarkers, record.id, record);
      state.pulseId = record.id;
      setSaving(false);
      closePicker();
      refreshUI();
      toast(isExpired(record) ? '已保存，标记有效期已结束。' :
        (local ? '已保存到当前浏览器。' : '标记已保存。'));
    } catch (error) {
      els.formError.textContent = error.message;
      setSaving(false);
    }
  }

  function changeMarkers(list, id, record) {
    var next = list.filter(function (marker) { return marker.id !== id; });
    if (record) next.push(record);
    return sortMarkers(next);
  }

  function setSaving(saving) {
    state.saving = saving;
    els.save.disabled = saving || state.avatarLoading;
    els.cancel.disabled = saving;
    els.closeSheet.disabled = saving;
    els.remove.disabled = saving;
    els.save.textContent = saving ? '处理中…' : (state.editing ? '保存修改' : '保存');
  }

  async function removeMarker(marker) {
    if (marker.local_only) saveLocal(null, marker.id);
    else await requestApi(API_URL, 'DELETE', { id: marker.id });
    state.markers = changeMarkers(state.markers, marker.id);
    state.adminMarkers = changeMarkers(state.adminMarkers, marker.id);
    refreshUI();
  }

  async function onRemoveClick() {
    if (!state.editing || state.saving) return;
    if (!state.removeArmed) {
      state.removeArmed = true;
      els.remove.textContent = '再点一次确认删除';
      els.remove.classList.add('armed');
      clearTimeout(removeTimer);
      removeTimer = setTimeout(resetRemoveLabel, 4000);
      return;
    }
    resetRemoveLabel();
    setSaving(true);
    try {
      await removeMarker(state.editing);
      setSaving(false);
      closePicker();
      toast('标记已删除。');
    } catch (error) {
      els.formError.textContent = error.message;
      setSaving(false);
    }
  }

  function resetRemoveLabel() {
    state.removeArmed = false;
    els.remove.classList.remove('armed');
    els.remove.textContent = '删除这个标记';
  }

  /* ---------- 标记管理 ---------- */

  function openManage(view) {
    state.manageView = view;
    els.manageStatus.textContent = '';
    renderManage();
    els.manageDialog.showModal();
    if (view === 'admin' && state.mode === 'shared' && state.admin) loadAdminMarkers();
  }

  function renderManage() {
    var adminView = state.manageView === 'admin';
    var onServer = state.mode === 'shared';
    var signedIn = adminView && onServer && state.admin;
    els.manageTitle.textContent = adminView ? (signedIn ? '管理所有标记' : '管理员模式') : '我的标记';
    els.adminForm.hidden = !adminView || !onServer || signedIn;
    els.adminTools.hidden = !signedIn;
    els.adminLogin.disabled = state.manageBusy;
    els.adminRefresh.disabled = state.manageBusy;
    els.adminLogout.disabled = state.manageBusy;
    els.manageList.replaceChildren();
    if (adminView && !signedIn) {
      if (!onServer) {
        els.manageStatus.textContent = state.ready ? '请通过本机服务器或共享网站打开，才能使用管理员模式。' : '正在连接标记服务…';
      }
      return;
    }
    var markers = signedIn ? state.adminMarkers : state.markers.filter(function (marker) { return marker.is_mine; });
    if (!markers.length && !state.manageBusy) {
      var empty = document.createElement('li');
      empty.className = 'manage-empty';
      empty.textContent = '还没有标记。';
      els.manageList.appendChild(empty);
    }
    markers.forEach(function (marker) {
      els.manageList.appendChild(manageItem(marker));
    });
  }

  function manageItem(marker) {
    var row = document.createElement('li');
    row.className = 'manage-item';
    row.appendChild(buildAvatar(marker.name, marker.emoji, marker.avatar_url));
    var info = document.createElement('div');
    var name = document.createElement('strong');
    name.className = 'manage-item-name';
    name.textContent = marker.name;
    var meta = document.createElement('span');
    meta.className = 'manage-item-meta';
    var time = marker.expires_at ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(marker.expires_at)) : '';
    meta.textContent = (marker.expires_at ? (isExpired(marker) ? '已到期 · ' : '到期 · ') + time : '长期') +
      (marker.local_only && state.mode === 'shared' ? ' · 仅此浏览器' : '');
    info.append(name, meta);
    var actions = document.createElement('div');
    actions.className = 'manage-item-actions';
    var edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'manage-link';
    edit.textContent = '编辑';
    edit.disabled = state.manageBusy;
    edit.addEventListener('click', function () {
      els.manageDialog.close();
      openPicker(marker);
    });
    var remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'manage-link danger';
    remove.textContent = '删除';
    remove.disabled = state.manageBusy;
    var confirmUntil = 0;
    remove.addEventListener('click', async function () {
      if (state.manageBusy) return;
      if (Date.now() >= confirmUntil) {
        confirmUntil = Date.now() + 4000;
        remove.textContent = '确认删除';
        setTimeout(function () { remove.textContent = '删除'; }, 4000);
        return;
      }
      state.manageBusy = true;
      renderManage();
      try {
        await removeMarker(marker);
        els.manageStatus.textContent = '标记已删除。';
      } catch (error) {
        els.manageStatus.textContent = error.message;
      } finally {
        state.manageBusy = false;
        renderManage();
      }
    });
    actions.append(edit, remove);
    row.append(info, actions);
    return row;
  }

  async function loadAdminMarkers() {
    if (state.manageBusy) return;
    state.manageBusy = true;
    els.manageStatus.textContent = '正在读取标记…';
    renderManage();
    try {
      var result = await readServerMarkers(true);
      state.admin = result.admin;
      state.adminMarkers = result.markers;
      var ownLocals = state.markers.filter(function (marker) { return marker.local_only; });
      state.markers = sortMarkers(result.markers.filter(function (marker) {
        return marker.is_mine || !isExpired(marker);
      }).concat(ownLocals));
      els.manageStatus.textContent = '';
      refreshUI();
    } catch (error) {
      if (error.status === 401) {
        if (API_BASE) setAdminToken('');
        state.admin = false;
        state.adminMarkers = [];
      }
      els.manageStatus.textContent = error.message;
    } finally {
      state.manageBusy = false;
      renderManage();
    }
  }

  async function onAdminLogin(event) {
    event.preventDefault();
    if (state.manageBusy) return;
    state.manageBusy = true;
    els.manageStatus.textContent = '';
    renderManage();
    try {
      var login = await requestApi(ADMIN_URL, 'POST', { action: 'login', password: els.adminPassword.value });
      if (API_BASE) {
        if (!login.token) throw new Error('没有收到管理员会话。');
        setAdminToken(login.token);
      }
      state.admin = true;
      els.adminPassword.value = '';
    } catch (error) {
      els.manageStatus.textContent = error.message;
    } finally {
      state.manageBusy = false;
      renderManage();
    }
    if (state.admin) await loadAdminMarkers();
  }

  async function logoutAdmin() {
    if (state.manageBusy) return;
    state.manageBusy = true;
    renderManage();
    try {
      await requestApi(ADMIN_URL, 'POST', { action: 'logout' });
      if (API_BASE) setAdminToken('');
      state.admin = false;
      state.adminMarkers = [];
      els.manageStatus.textContent = '已退出管理员模式。';
    } catch (error) {
      els.manageStatus.textContent = error.message;
    } finally {
      state.manageBusy = false;
      renderManage();
    }
  }

  function normalizeEmoji(value) {
    var text = typeof value === 'string' ? value.trim() : '';
    return EMOJI_SET.has(text) ? text : '';
  }

  function fuzz(value) {
    var rounded = Math.round(value * 100) / 100;
    return Object.is(rounded, -0) ? 0 : rounded;
  }

  function newId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return 'm-' + window.crypto.randomUUID();
    }
    return 'm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toast(message, duration) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.classList.remove('show');
    }, duration || 2600);
  }
})();
