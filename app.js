(() => {
  "use strict";

  const TYPE_COLORS = {
    Correctivo: "#c96a61",
    Preventivo: "#238779",
    Predictivo: "#557fb5",
    "Sin clasificar": "#718096"
  };
  const CHART_COLORS = {
    ink: "#31445b",
    blue: "#557fb5",
    teal: "#238779",
    amber: "#c28a3d",
    grid: "#e9edf2",
    text: "#68778a"
  };
  const QUADRANTS = [
    { key: "Bajo control", color: "#4592d6" },
    { key: "Agudo", color: "#df9b3d" },
    { key: "Crónico", color: "#8b6bd1" },
    { key: "Grave", color: "#d75d64" }
  ];
  const REQUIRED_COLUMNS = ["ot", "tipo_mantenimiento"];
  const CHART_IDS = ["maintenanceChart", "resourceChart", "paretoChart", "mttrChart", "jackknifeChart", "equipmentChart"];
  const charts = new Map();
  const state = { rows: [], fileName: "", dataReady: false };

  const $ = (id) => document.getElementById(id);
  const formatter = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 });
  const integerFormatter = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
  const currencyFormatter = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

  function setStatus(message, kind = "info") {
    const box = $("statusMessage");
    box.textContent = message;
    box.className = `status-message ${kind}`;
    box.hidden = !message;
  }

  function cleanText(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .normalize("NFKC")
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
      .trim()
      .replace(/^['’‘`´]+/u, "")
      .replace(/\s+/gu, " ")
      .trim();
  }

  function slug(value) {
    return cleanText(value).normalize("NFD").replace(/\p{M}/gu, "")
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }

  function parseNumber(value) {
    let text = cleanText(value).replace(/[\s\u00a0]/g, "").replace(/[^\d,().+-]/g, "");
    if (!text) return null;
    const negative = /^\(.*\)$/.test(text);
    text = text.replace(/[()]/g, "");
    const comma = text.lastIndexOf(",");
    const dot = text.lastIndexOf(".");
    if (comma >= 0 && dot >= 0) {
      const decimal = comma > dot ? "," : ".";
      const thousands = decimal === "," ? /\./g : /,/g;
      text = text.replace(thousands, "");
      if (decimal === ",") text = text.replace(",", ".");
    } else if (comma >= 0) {
      const digitsAfter = text.length - comma - 1;
      text = digitsAfter > 0 && digitsAfter <= 2
        ? text.replace(",", ".")
        : text.replace(/,/g, "");
    } else if (dot >= 0) {
      const digitsAfter = text.length - dot - 1;
      if (digitsAfter === 3 && text.indexOf(".") === dot) text = text.replace(".", "");
      else if ((text.match(/\./g) || []).length > 1) {
        const last = text.lastIndexOf(".");
        text = text.slice(0, last).replace(/\./g, "") + text.slice(last);
      }
    }
    const number = Number(text);
    return Number.isFinite(number) ? (negative ? -number : number) : null;
  }

  function parseDate(value) {
    const text = cleanText(value);
    if (!text) return null;
    const match = text.match(/^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!match) {
      const generic = new Date(text);
      return Number.isNaN(generic.getTime()) ? null : generic;
    }
    let year;
    let month;
    let day;
    if (match[1].length === 4) {
      year = Number(match[1]);
      month = Number(match[2]);
      day = Number(match[3]);
    } else {
      day = Number(match[1]);
      month = Number(match[2]);
      year = Number(match[3]);
      if (year < 100) year += year < 50 ? 2000 : 1900;
    }
    const date = new Date(year, month - 1, day, Number(match[4] || 0), Number(match[5] || 0), Number(match[6] || 0));
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  }

  function normalizeType(value) {
    const text = cleanText(value);
    const key = slug(text);
    if (/(^|_)correctiv[oa]($|_)/.test(key)) return "Correctivo";
    if (/(^|_)preventiv[oa]($|_)/.test(key)) return "Preventivo";
    if (/(^|_)predictiv[oa]($|_)/.test(key)) return "Predictivo";
    return text || "Sin clasificar";
  }

  function normalizeState(value) {
    const text = cleanText(value);
    const key = slug(text);
    if (["cerrada", "cerrado", "finalizada", "finalizado"].includes(key)) return "Cerrada";
    if (["abierta", "abierto"].includes(key)) return "Abierta";
    if (["en_ejecucion", "ejecutando", "en_proceso"].includes(key)) return "En ejecución";
    return text;
  }

  function canonicalRow(raw) {
    const source = {};
    for (const [header, value] of Object.entries(raw)) {
      source[slug(header)] = value;
    }
    const getText = (key) => cleanText(source[key]);
    const getNumber = (key) => parseNumber(source[key]);
    const getDate = (key) => parseDate(source[key]);
    const type = normalizeType(source.tipo_mantenimiento);
    const record = {
      ot: getText("ot"),
      aviso: getText("aviso"),
      tipo: type,
      estado: normalizeState(source.estado),
      equipo: getText("equipo") || "Sin equipo",
      tipoEquipo: getText("tipo_equipo") || "Sin tipo",
      criticidad: getText("criticidad") || "Sin dato",
      modoFalla: getText("modo_falla"),
      causa: getText("causa"),
      sintoma: getText("sintoma"),
      unidad: getText("unidad"),
      area: getText("area"),
      fechaCreacion: getDate("fecha_creacion"),
      fechaInicio: getDate("fecha_inicio"),
      fechaFin: getDate("fecha_fin"),
      downtime: getNumber("downtime_h") ?? 0,
      horas: getNumber("horas_mano_obra") ?? 0,
      costo: getNumber("costo_total_clp") ?? 0,
      costoRepuestos: getNumber("costo_repuestos_clp") ?? 0,
      costoExterno: getNumber("costo_externo_clp") ?? 0,
      tiempoEspera: getNumber("tiempo_espera_h"),
      tiempoReparacion: getNumber("tiempo_reparacion_h"),
      raw
    };
    if (!record.ot && !record.equipo && !record.modoFalla) return null;
    return record;
  }

  function validateAndNormalize(rawRows, fileName) {
    if (!Array.isArray(rawRows) || !rawRows.length) throw new Error("El archivo no contiene filas de datos.");
    const headers = Object.keys(rawRows[0] || {}).map(slug);
    const missing = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
    if (missing.length) {
      throw new Error(`Faltan columnas obligatorias: ${missing.join(", ")}. Se requiere al menos OT y Tipo_mantenimiento.`);
    }
    const rows = rawRows.map(canonicalRow).filter(Boolean);
    if (!rows.length) throw new Error("No se encontraron órdenes de trabajo válidas en el archivo.");
    const dataName = fileName.replace(/\.[^.]+$/, "");
    const typeHeader = Object.keys(rawRows[0]).find((header) => slug(header) === "tipo_mantenimiento");
    const sourceVariants = new Map();
    rawRows.forEach((raw) => {
      const sourceValue = String(raw[typeHeader] ?? "").trim();
      const normalized = normalizeType(raw[typeHeader]);
      if (!sourceVariants.has(normalized)) sourceVariants.set(normalized, new Set());
      if (sourceValue) sourceVariants.get(normalized).add(sourceValue);
    });
    const normalizationNotes = [...sourceVariants.entries()]
      .filter(([, variants]) => variants.size > 1)
      .map(([type, variants]) => `${type}: ${variants.size} variantes agrupadas`);
    return { rows, dataName, normalizationNotes };
  }

  function parseCsv(file) {
    return new Promise((resolve, reject) => {
      if (!window.Papa) return reject(new Error("No se pudo cargar el lector CSV. Comprueba tu conexión a internet e inténtalo de nuevo."));
      window.Papa.parse(file, {
        header: true,
        skipEmptyLines: "greedy",
        dynamicTyping: false,
        transformHeader: (header) => cleanText(header),
        complete: (result) => {
          if (result.errors?.length && result.data.length === 0) return reject(new Error(result.errors[0].message));
          try { resolve(validateAndNormalize(result.data, file.name)); }
          catch (error) { reject(error); }
        },
        error: (error) => reject(error)
      });
    });
  }

  function parseWorkbook(file) {
    return new Promise((resolve, reject) => {
      if (!window.XLSX) return reject(new Error("No se pudo cargar el lector Excel. Comprueba tu conexión a internet e inténtalo de nuevo."));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("No fue posible leer el archivo seleccionado."));
      reader.onload = (event) => {
        try {
          const workbook = window.XLSX.read(event.target.result, { type: "array", cellDates: true });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const records = window.XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
          resolve(validateAndNormalize(records, file.name));
        } catch (error) {
          reject(error);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  async function loadFile(file) {
    if (!file) return;
    const extension = file.name.split(".").pop().toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(extension)) {
      setStatus("Formato no compatible. Selecciona un archivo CSV, XLSX o XLS.", "error");
      return;
    }
    setStatus(`Leyendo ${file.name}…`);
    try {
      const result = extension === "csv" ? await parseCsv(file) : await parseWorkbook(file);
      state.rows = result.rows;
      state.fileName = file.name;
      state.dataReady = true;
      $("sourceName").textContent = file.name;
      $("exportPdf").disabled = false;
      populateFilters();
      applyFilters();
      const missingDates = state.rows.filter((row) => !row.fechaInicio && !row.fechaCreacion).length;
      const notes = [...result.normalizationNotes];
      if (missingDates) notes.push(`${integerFormatter.format(missingDates)} filas sin fecha para filtros temporales`);
      const note = notes.length ? ` Homologación: ${notes.join("; ")}.` : "";
      setStatus(`Dataset cargado: ${integerFormatter.format(state.rows.length)} filas de ${file.name}.${note}`, "success");
    } catch (error) {
      setStatus(error.message || "No fue posible procesar el archivo.", "error");
    } finally {
      $("fileInput").value = "";
    }
  }

  function dateInputValue(date) {
    if (!date) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function populateFilters() {
    const typeSelect = $("typeFilter");
    const criticalitySelect = $("criticalityFilter");
    const types = uniqueSorted(state.rows.map((row) => row.tipo));
    const criticalities = uniqueSorted(state.rows.map((row) => row.criticidad).filter((value) => value !== "Sin dato"));
    typeSelect.innerHTML = '<option value="">Todos los tipos</option>';
    criticalitySelect.innerHTML = '<option value="">Todas</option>';
    types.forEach((type) => typeSelect.add(new Option(type, type)));
    criticalities.forEach((value) => criticalitySelect.add(new Option(value, value)));
    $("searchFilter").value = "";
    const dates = state.rows.map((row) => row.fechaInicio || row.fechaCreacion).filter(Boolean).map(dateInputValue).sort();
    $("dateFrom").min = dates[0] || "";
    $("dateFrom").max = dates.at(-1) || "";
    $("dateTo").min = dates[0] || "";
    $("dateTo").max = dates.at(-1) || "";
    $("dateFrom").value = "";
    $("dateTo").value = "";
  }

  function uniqueSorted(values) {
    return [...new Set(values)].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  }

  function applyFilters() {
    if (!state.dataReady) return;
    const filtered = filteredRows();
    const metrics = calculateMetrics(filtered);
    renderKpis(metrics);
    renderCharts(metrics);
    renderPriorityTable(metrics);
    const activeFilters = [$("typeFilter").value, $("criticalityFilter").value, $("dateFrom").value, $("dateTo").value, slug($("searchFilter").value)].filter(Boolean).length;
    $("periodNote").textContent = activeFilters
      ? `${integerFormatter.format(filtered.length)} registros · filtros aplicados`
      : "Vista completa del dataset";
  }

  function filteredRows() {
    const selectedType = $("typeFilter").value;
    const selectedCriticality = $("criticalityFilter").value;
    const from = $("dateFrom").value;
    const to = $("dateTo").value;
    const query = slug($("searchFilter").value);
    return state.rows.filter((row) => {
      if (selectedType && row.tipo !== selectedType) return false;
      if (selectedCriticality && row.criticidad !== selectedCriticality) return false;
      const date = row.fechaInicio || row.fechaCreacion;
      if (from && (!date || dateInputValue(date) < from)) return false;
      if (to && (!date || dateInputValue(date) > to)) return false;
      if (query) {
        const haystack = slug([row.ot, row.aviso, row.equipo, row.modoFalla, row.causa, row.sintoma, row.unidad, row.area].join(" "));
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }

  function sum(rows, key) {
    return rows.reduce((total, row) => total + (Number.isFinite(row[key]) ? row[key] : 0), 0);
  }

  function byType(rows) {
    const map = new Map();
    rows.forEach((row) => {
      if (!map.has(row.tipo)) map.set(row.tipo, { type: row.tipo, orders: new Set(), hours: 0, downtime: 0, cost: 0 });
      const item = map.get(row.tipo);
      if (row.ot) item.orders.add(row.ot);
      item.hours += row.horas;
      item.downtime += row.downtime;
      item.cost += row.costo;
    });
    return [...map.values()].map((item) => ({ ...item, orders: item.orders.size }))
      .sort((a, b) => b.orders - a.orders);
  }

  function calculateMetrics(rows) {
    const orders = new Set(rows.map((row) => row.ot).filter(Boolean)).size;
    const correctiveOrders = new Set(rows.filter((row) => row.tipo === "Correctivo").map((row) => row.ot).filter(Boolean)).size;
    const corrective = rows.filter((row) => row.tipo === "Correctivo");
    const validRepairMap = new Map();
    const validCorrective = corrective.filter((row) => {
      if (row.estado !== "Cerrada" || !row.fechaInicio || !row.fechaFin) return false;
      return (row.fechaFin - row.fechaInicio) / 3600000 > 0;
    });
    validCorrective.forEach((row) => {
      if (row.estado !== "Cerrada" || !row.ot || !row.fechaInicio || !row.fechaFin) return;
      const duration = (row.fechaFin - row.fechaInicio) / 3600000;
      if (duration > 0 && !validRepairMap.has(row.ot)) validRepairMap.set(row.ot, duration);
    });
    const repairTimes = [...validRepairMap.values()];
    const repairTotal = repairTimes.reduce((total, value) => total + value, 0);
    const sortedRepairs = [...repairTimes].sort((a, b) => a - b);
    const middle = Math.floor(sortedRepairs.length / 2);
    const median = sortedRepairs.length
      ? sortedRepairs.length % 2 ? sortedRepairs[middle] : (sortedRepairs[middle - 1] + sortedRepairs[middle]) / 2
      : 0;
    const repairs = new Map();
    corrective.forEach((row) => {
      const duration = row.fechaInicio && row.fechaFin ? (row.fechaFin - row.fechaInicio) / 3600000 : 0;
      if (!row.ot || row.estado !== "Cerrada" || duration <= 0 || !row.tipoEquipo) return;
      if (!repairs.has(row.tipoEquipo)) repairs.set(row.tipoEquipo, { type: row.tipoEquipo, times: new Map() });
      if (!repairs.get(row.tipoEquipo).times.has(row.ot)) repairs.get(row.tipoEquipo).times.set(row.ot, duration);
    });
    const mttrByEquipmentType = [...repairs.values()].map((item) => {
      const times = [...item.times.values()];
      return { type: item.type, mttr: times.reduce((total, value) => total + value, 0) / times.length, count: times.length };
    }).sort((a, b) => b.mttr - a.mttr).slice(0, 12);

    const faults = new Map();
    corrective.forEach((row) => {
      const name = row.modoFalla || "";
      if (!name || !row.ot) return;
      if (!faults.has(name)) faults.set(name, new Set());
      faults.get(name).add(row.ot);
    });
    const faultPareto = [...faults.entries()].map(([name, ids]) => ({ name, count: ids.size }))
      .sort((a, b) => b.count - a.count);
    const faultTotal = faultPareto.reduce((total, item) => total + item.count, 0);
    let cumulative = 0;
    faultPareto.forEach((item) => {
      item.percent = faultTotal ? item.count / faultTotal * 100 : 0;
      cumulative += item.percent;
      item.cumulative = cumulative;
    });

    const equipmentMap = new Map();
    validCorrective.forEach((row) => {
      if (!row.ot || row.equipo === "Sin equipo") return;
      if (!equipmentMap.has(row.equipo)) {
        equipmentMap.set(row.equipo, { equipment: row.equipo, type: row.tipoEquipo, criticality: row.criticidad, orders: new Set(), downtime: 0 });
      }
      const item = equipmentMap.get(row.equipo);
      item.orders.add(row.ot);
      item.downtime += row.downtime;
    });
    const equipment = [...equipmentMap.values()].map((item) => {
      const count = item.orders.size;
      return { ...item, count, mttr: count ? item.downtime / count : 0 };
    });
    const averageFrequency = equipment.length ? equipment.reduce((total, item) => total + item.count, 0) / equipment.length : 0;
    const totalFailureCount = equipment.reduce((total, item) => total + item.count, 0);
    const averageDowntimePerFailure = totalFailureCount
      ? equipment.reduce((total, item) => total + item.downtime, 0) / totalFailureCount
      : 0;
    const jackknife = equipment.map((item) => {
      const frequencyNorm = averageFrequency ? item.count / averageFrequency : 0;
      const mttrNorm = averageDowntimePerFailure ? item.mttr / averageDowntimePerFailure : 0;
      let quadrant = "Bajo control";
      if (frequencyNorm >= 1 && mttrNorm >= 1) quadrant = "Grave";
      else if (frequencyNorm >= 1) quadrant = "Crónico";
      else if (mttrNorm >= 1) quadrant = "Agudo";
      return { ...item, frequencyNorm, mttrNorm, risk: frequencyNorm * mttrNorm, quadrant };
    }).sort((a, b) => b.risk - a.risk);
    const topDowntime = [...equipment].sort((a, b) => b.downtime - a.downtime).slice(0, 10);
    const typeRows = byType(rows);
    return {
      rows,
      orders,
      correctiveOrders,
      correctiveShare: orders ? correctiveOrders / orders * 100 : 0,
      hours: sum(rows, "horas"),
      downtime: sum(rows, "downtime"),
      cost: sum(rows, "costo"),
      mttr: repairTimes.length ? repairTotal / repairTimes.length : 0,
      median,
      repairCount: repairTimes.length,
      typeRows,
      faultPareto,
      mttrByEquipmentType,
      jackknife,
      topDowntime,
      averageFrequency,
      averageDowntimePerFailure
    };
  }

  function renderKpis(metrics) {
    $("kpiOrders").textContent = integerFormatter.format(metrics.orders);
    $("kpiRows").textContent = `${integerFormatter.format(metrics.rows.length)} registros analizados`;
    $("kpiCorrective").textContent = `${formatter.format(metrics.correctiveShare)}%`;
    $("kpiCorrectiveFoot").textContent = `${integerFormatter.format(metrics.correctiveOrders)} OT correctivas`;
    $("kpiHours").textContent = formatter.format(metrics.hours);
    $("kpiDowntime").textContent = formatter.format(metrics.downtime);
    $("kpiCost").textContent = formatCompactCLP(metrics.cost);
    $("kpiCostFoot").textContent = Math.abs(metrics.cost) >= 1_000_000
      ? "Millones de CLP registrados"
      : "CLP registrados en el CMMS";
    $("kpiMttr").textContent = metrics.repairCount ? `${formatter.format(metrics.mttr)} h` : "N/D";
    $("kpiMttrFoot").textContent = metrics.repairCount
      ? `Mediana ${formatter.format(metrics.median)} h · ${integerFormatter.format(metrics.repairCount)} reparaciones`
      : "Sin órdenes cerradas con fechas válidas";
  }

  function formatCompactCLP(value) {
    const millions = value / 1_000_000;
    if (Math.abs(millions) >= 1) return `${formatter.format(millions)} M`;
    return currencyFormatter.format(value);
  }

  function chartOptions(extra = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 350 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#142438",
          titleFont: { family: "DM Sans", size: 10, weight: "600" },
          bodyFont: { family: "DM Sans", size: 10 },
          padding: 10,
          cornerRadius: 6,
          displayColors: true
        }
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: CHART_COLORS.text, font: { family: "DM Sans", size: 9 } } },
        y: { beginAtZero: true, grid: { color: CHART_COLORS.grid }, border: { display: false }, ticks: { color: CHART_COLORS.text, font: { family: "DM Sans", size: 8 }, precision: 0 } }
      },
      ...extra
    };
  }

  function renderChart(id, config) {
    const canvas = $(id);
    if (!canvas || !window.Chart) return;
    if (charts.has(id)) charts.get(id).destroy();
    const chart = new window.Chart(canvas, config);
    charts.set(id, chart);
  }

  function renderCharts(metrics) {
    const types = metrics.typeRows;
    const labels = types.map((item) => item.type);
    renderChart("maintenanceChart", {
      type: "bar",
      data: { labels, datasets: [{ label: "OT únicas", data: types.map((item) => item.orders), backgroundColor: labels.map((label) => TYPE_COLORS[label] || "#718096"), borderRadius: 4, maxBarThickness: 42 }] },
      options: chartOptions({ plugins: { ...chartOptions().plugins, tooltip: { ...chartOptions().plugins.tooltip, callbacks: { label: (context) => ` ${integerFormatter.format(context.raw)} órdenes` } } } })
    });

    renderChart("resourceChart", {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Horas-hombre", data: types.map((item) => item.hours), backgroundColor: CHART_COLORS.blue, borderRadius: 3, yAxisID: "y" },
          { label: "Downtime", data: types.map((item) => item.downtime), backgroundColor: CHART_COLORS.teal, borderRadius: 3, yAxisID: "y1" }
        ]
      },
      options: chartOptions({
        plugins: { ...chartOptions().plugins, legend: { display: true, position: "bottom", labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: "circle", color: "#748295", font: { family: "DM Sans", size: 8 }, padding: 14 } } },
        scales: {
          x: chartOptions().scales.x,
          y: { ...chartOptions().scales.y, position: "left", title: { display: true, text: "HH", color: "#8b98a7", font: { size: 8 } } },
          y1: { beginAtZero: true, position: "right", grid: { drawOnChartArea: false }, border: { display: false }, ticks: { color: "#8794a3", font: { family: "DM Sans", size: 8 }, precision: 0 }, title: { display: true, text: "Downtime · h", color: "#8b98a7", font: { size: 8 } } }
        }
      })
    });

    const pareto = metrics.faultPareto.slice(0, 10);
    renderChart("paretoChart", {
      type: "bar",
      data: { labels: pareto.map((item) => shortLabel(item.name, 21)), datasets: [
        { type: "bar", label: "Eventos", data: pareto.map((item) => item.count), backgroundColor: CHART_COLORS.blue, borderRadius: 3, maxBarThickness: 34, yAxisID: "y" },
        { type: "line", label: "% acumulado", data: pareto.map((item) => item.cumulative), borderColor: CHART_COLORS.amber, backgroundColor: CHART_COLORS.amber, pointBackgroundColor: "#fff", pointBorderColor: CHART_COLORS.amber, pointBorderWidth: 2, pointRadius: 3, tension: .25, yAxisID: "y1" }
      ] },
      options: chartOptions({
        plugins: { ...chartOptions().plugins, legend: { display: true, position: "bottom", labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: "circle", color: "#748295", font: { family: "DM Sans", size: 8 }, padding: 14 } } },
        scales: {
          x: { ...chartOptions().scales.x, ticks: { ...chartOptions().scales.x.ticks, maxRotation: 30, minRotation: 0 } },
          y: chartOptions().scales.y,
          y1: { min: 0, max: 100, position: "right", grid: { drawOnChartArea: false }, border: { display: false }, ticks: { color: "#8794a3", font: { family: "DM Sans", size: 8 }, callback: (value) => `${value}%` } }
        }
      })
    });

    const mttrData = [...metrics.mttrByEquipmentType].reverse();
    renderChart("mttrChart", {
      type: "bar",
      data: { labels: mttrData.map((item) => shortLabel(item.type, 24)), datasets: [{ label: "MTTR · h", data: mttrData.map((item) => item.mttr), backgroundColor: "#49b5a4", borderRadius: 3, maxBarThickness: 17 }] },
      options: chartOptions({
        indexAxis: "y",
        plugins: { ...chartOptions().plugins, tooltip: { ...chartOptions().plugins.tooltip, callbacks: { label: (context) => ` ${formatter.format(context.raw)} h` } } },
        scales: { x: { ...chartOptions().scales.y, ticks: { color: "#8794a3", font: { family: "DM Sans", size: 8 } } }, y: { grid: { display: false }, border: { display: false }, ticks: { color: "#68798c", font: { family: "DM Sans", size: 8 } } } }
      })
    });

    const groups = QUADRANTS.map((quadrant) => ({
      label: quadrant.key,
      data: metrics.jackknife.filter((item) => item.quadrant === quadrant.key).map((item) => ({ x: item.frequencyNorm, y: item.mttrNorm, name: item.equipment, risk: item.risk })),
      backgroundColor: quadrant.color,
      pointRadius: 5,
      pointHoverRadius: 7
    }));
    renderChart("jackknifeChart", {
      type: "scatter",
      data: { datasets: groups },
      options: chartOptions({
        plugins: {
          ...chartOptions().plugins,
          legend: { display: true, position: "bottom", labels: { boxWidth: 7, boxHeight: 7, usePointStyle: true, pointStyle: "circle", color: "#748295", font: { family: "DM Sans", size: 8 }, padding: 11 } },
          tooltip: { ...chartOptions().plugins.tooltip, callbacks: { label: (context) => `${context.raw.name} · Frec. ${formatter.format(context.raw.x)}× · Downtime ${formatter.format(context.raw.y)}×` } },
          jackknifeGuides: { frequency: metrics.averageFrequency ? 1 : null, downtime: metrics.averageDowntimePerFailure ? 1 : null },
          assetLabels: true
        },
        scales: {
          x: { ...chartOptions().scales.x, title: { display: true, text: "Frecuencia relativa de fallas", color: "#8190a1", font: { family: "DM Sans", size: 8 } } },
          y: { ...chartOptions().scales.y, title: { display: true, text: "Downtime medio relativo", color: "#8190a1", font: { family: "DM Sans", size: 8 } } }
        }
      }),
      plugins: [jackknifeGuidePlugin, assetLabelPlugin]
    });

    const equipment = [...metrics.topDowntime].reverse();
    renderChart("equipmentChart", {
      type: "bar",
      data: { labels: equipment.map((item) => shortLabel(item.equipment, 20)), datasets: [{ label: "Downtime · h", data: equipment.map((item) => item.downtime), backgroundColor: equipment.map((_, index) => index === equipment.length - 1 ? "#d75d64" : "#779bd1"), borderRadius: 3, maxBarThickness: 16 }] },
      options: chartOptions({
        indexAxis: "y",
        plugins: { ...chartOptions().plugins, tooltip: { ...chartOptions().plugins.tooltip, callbacks: { label: (context) => ` ${formatter.format(context.raw)} h` } } },
        scales: { x: chartOptions().scales.y, y: { grid: { display: false }, border: { display: false }, ticks: { color: "#68798c", font: { family: "DM Sans", size: 8 } } } }
      })
    });
  }

  const jackknifeGuidePlugin = {
    id: "jackknifeGuides",
    afterDraw(chart, _args, options) {
      if (!options || options.frequency === null || options.downtime === null) return;
      const { ctx, chartArea, scales } = chart;
      const x = scales.x.getPixelForValue(options.frequency);
      const y = scales.y.getPixelForValue(options.downtime);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "#c6d0dc";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, chartArea.top); ctx.lineTo(x, chartArea.bottom); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(chartArea.left, y); ctx.lineTo(chartArea.right, y); ctx.stroke();
      ctx.restore();
    }
  };

  const assetLabelPlugin = {
    id: "assetLabels",
    afterDatasetsDraw(chart, _args, enabled) {
      if (!enabled) return;
      const { ctx } = chart;
      ctx.save();
      ctx.font = '8px "DM Sans", sans-serif';
      ctx.fillStyle = "#68798c";
      chart.data.datasets.forEach((dataset, datasetIndex) => {
        chart.getDatasetMeta(datasetIndex).data.forEach((point, index) => {
          const raw = dataset.data[index];
          if (raw && raw.risk >= 2.5) ctx.fillText(shortLabel(raw.name, 16), point.x + 7, point.y - 5);
        });
      });
      ctx.restore();
    }
  };

  function shortLabel(value, length) {
    return value.length > length ? `${value.slice(0, length - 1)}…` : value;
  }

  function renderPriorityTable(metrics) {
    const selected = metrics.jackknife.slice(0, 10);
    $("priorityCount").textContent = `${integerFormatter.format(metrics.jackknife.length)} activos`;
    const body = $("priorityTable");
    if (!selected.length) {
      body.innerHTML = '<tr><td colspan="9" class="empty-table">No hay órdenes correctivas válidas para clasificar activos.</td></tr>';
      return;
    }
    body.innerHTML = selected.map((item, index) => `
      <tr>
        <td>${String(index + 1).padStart(2, "0")}</td>
        <td class="asset-name">${escapeHtml(item.equipment)}</td>
        <td>${escapeHtml(item.type)}</td>
        <td>${escapeHtml(item.criticality)}</td>
        <td>${integerFormatter.format(item.count)}</td>
        <td>${formatter.format(item.mttr)}</td>
        <td>${formatter.format(item.downtime)}</td>
        <td class="risk-value">${formatter.format(item.risk)}</td>
        <td><span class="quadrant ${quadrantClass(item.quadrant)}">${escapeHtml(item.quadrant)}</span></td>
      </tr>`).join("");
  }

  function quadrantClass(value) {
    return ({ "Bajo control": "bajo-control", "Agudo": "agudo", "Crónico": "cronico", "Grave": "grave" })[value] || "bajo-control";
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function activeMetrics() {
    return calculateMetrics(filteredRows());
  }

  function formatDate(date) {
    return new Intl.DateTimeFormat("es-CL", { dateStyle: "long" }).format(date);
  }

  function addPdfHeader(doc, pageWidth) {
    doc.setFillColor(13, 27, 42);
    doc.rect(0, 0, pageWidth, 13, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text("GMAO  /  GESTIÓN DE MANTENIMIENTO", 14, 8.3);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(197, 215, 231);
    doc.text("INFORME EJECUTIVO", pageWidth - 14, 8.3, { align: "right" });
  }

  function addPdfFooter(doc, pageWidth, pageHeight) {
    const total = doc.getNumberOfPages();
    for (let page = 1; page <= total; page += 1) {
      doc.setPage(page);
      addPdfHeader(doc, pageWidth);
      doc.setDrawColor(229, 235, 241);
      doc.line(14, pageHeight - 13, pageWidth - 14, pageHeight - 13);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(128, 142, 158);
      doc.text("Análisis CMMS · Generado localmente en el navegador", 14, pageHeight - 8);
      doc.text(`${page} / ${total}`, pageWidth - 14, pageHeight - 8, { align: "right" });
    }
  }

  function pdfTable(doc, options) {
    doc.autoTable({
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8, cellPadding: 2.3, textColor: [57, 73, 92], lineColor: [231, 236, 241], lineWidth: .15 },
      headStyles: { fillColor: [238, 243, 249], textColor: [60, 79, 101], fontStyle: "bold", lineColor: [226, 233, 240] },
      alternateRowStyles: { fillColor: [250, 252, 254] },
      margin: { left: 14, right: 14, top: 20, bottom: 18 },
      ...options
    });
  }

  function drawPdfSectionTitle(doc, title, y) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(22, 43, 64);
    doc.text(title, 14, y);
    doc.setDrawColor(48, 124, 221);
    doc.setLineWidth(.8);
    doc.line(14, y + 3, 34, y + 3);
    return y + 11;
  }

  function addPdfKpis(doc, metrics, pageWidth, y) {
    const values = [
      ["Órdenes de trabajo", integerFormatter.format(metrics.orders)],
      ["Correctivo", `${formatter.format(metrics.correctiveShare)}%`],
      ["Horas de mano de obra", `${formatter.format(metrics.hours)} h`],
      ["Downtime total", `${formatter.format(metrics.downtime)} h`],
      ["Costo directo", currencyFormatter.format(metrics.cost)],
      ["MTTR correctivo", metrics.repairCount ? `${formatter.format(metrics.mttr)} h` : "N/D"]
    ];
    const gap = 4;
    const cardWidth = (pageWidth - 28 - gap * 2) / 3;
    const cardHeight = 22;
    values.forEach(([label, value], index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const x = 14 + column * (cardWidth + gap);
      const top = y + row * (cardHeight + 4);
      doc.setFillColor(247, 250, 253);
      doc.setDrawColor(230, 236, 243);
      doc.roundedRect(x, top, cardWidth, cardHeight, 2, 2, "FD");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(122, 139, 157);
      doc.text(label.toUpperCase(), x + 4, top + 7);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(value.length > 17 ? 11 : 13);
      doc.setTextColor(21, 43, 65);
      doc.text(value, x + 4, top + 16);
    });
    return y + cardHeight * 2 + 8;
  }

  function addChartPages(doc) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const chartsToPrint = [
      ["maintenanceChart", "Órdenes por tipo de mantenimiento"],
      ["resourceChart", "Horas de mano de obra y downtime"],
      ["paretoChart", "Pareto de modos de falla"],
      ["mttrChart", "MTTR por tipo de equipo"],
      ["jackknifeChart", "Diagrama Jack-Knife de equipos"],
      ["equipmentChart", "Equipos con mayor downtime"]
    ];
    for (let index = 0; index < chartsToPrint.length; index += 2) {
      doc.addPage();
      let y = 22;
      for (const [id, title] of chartsToPrint.slice(index, index + 2)) {
        const chart = charts.get(id);
        if (!chart) continue;
        y = drawPdfSectionTitle(doc, title, y);
        const image = chart.toBase64Image("image/png", 1);
        const maxWidth = pageWidth - 32;
        const imageHeight = 75;
        doc.addImage(image, "PNG", 16, y, maxWidth, imageHeight, undefined, "FAST");
        y += imageHeight + 13;
      }
    }
  }

  function exportPdf() {
    if (!state.dataReady) return;
    if (!window.jspdf?.jsPDF) {
      setStatus("No se pudo cargar el exportador PDF. Comprueba tu conexión a internet e inténtalo de nuevo.", "error");
      return;
    }
    const button = $("exportPdf");
    button.disabled = true;
    button.textContent = "Preparando informe…";
    try {
      const metrics = activeMetrics();
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const correctiveShare = metrics.correctiveShare;
      const leadingFault = metrics.faultPareto[0];
      const leadingAsset = metrics.jackknife[0];

      addPdfHeader(doc, pageWidth);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(94, 115, 137);
      doc.text("REPORTE TÉCNICO-GERENCIAL", 14, 26);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(23);
      doc.setTextColor(17, 39, 61);
      doc.text("Gestión de mantenimiento", 14, 38);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(103, 120, 139);
      doc.text(`Dataset: ${state.fileName}`, 14, 46);
      doc.text(`Fecha de emisión: ${formatDate(new Date())}`, 14, 52);
      const filterSummary = [
        $("typeFilter").value && `Tipo: ${$("typeFilter").value}`,
        $("criticalityFilter").value && `Criticidad: ${$("criticalityFilter").value}`,
        $("dateFrom").value && `Desde: ${$("dateFrom").value}`,
        $("dateTo").value && `Hasta: ${$("dateTo").value}`,
        $("searchFilter").value && `Búsqueda: ${$("searchFilter").value}`
      ].filter(Boolean).join(" · ");
      if (filterSummary) doc.text(`Filtros: ${filterSummary}`, 14, 58, { maxWidth: pageWidth - 28 });

      let y = addPdfKpis(doc, metrics, pageWidth, filterSummary ? 66 : 61);
      y = drawPdfSectionTitle(doc, "Resumen ejecutivo", y + 2);
      const summaryParts = [
        `${integerFormatter.format(metrics.orders)} órdenes únicas analizadas; el mantenimiento correctivo representa ${formatter.format(correctiveShare)}% de las OT.`
      ];
      if (leadingFault) summaryParts.push(`El modo de falla con mayor frecuencia es “${leadingFault.name}” (${integerFormatter.format(leadingFault.count)} OT correctivas).`);
      if (leadingAsset) summaryParts.push(`El activo con mayor riesgo técnico relativo es ${leadingAsset.equipment} (${leadingAsset.quadrant}; riesgo ${formatter.format(leadingAsset.risk)}).`);
      summaryParts.push(`MTTR calculado sobre ${integerFormatter.format(metrics.repairCount)} órdenes correctivas cerradas con fechas válidas. El análisis no estima MTBF porque no contiene el tiempo operacional continuo de los activos.`);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(76, 93, 111);
      const summaryLines = doc.splitTextToSize(summaryParts.join(" "), pageWidth - 30);
      doc.text(summaryLines, 14, y);
      y += summaryLines.length * 4.5 + 5;

      y = drawPdfSectionTitle(doc, "Distribución por tipo de mantenimiento", y);
      pdfTable(doc, {
        startY: y,
        head: [["Tipo", "OT únicas", "% OT", "Horas-hombre", "Downtime · h", "Costo · CLP"]],
        body: metrics.typeRows.map((item) => [
          item.type,
          integerFormatter.format(item.orders),
          `${formatter.format(metrics.orders ? item.orders / metrics.orders * 100 : 0)}%`,
          formatter.format(item.hours),
          formatter.format(item.downtime),
          currencyFormatter.format(item.cost)
        ]),
        columnStyles: { 0: { cellWidth: 31 }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } }
      });
      addChartPages(doc);
      doc.addPage();
      let reportY = drawPdfSectionTitle(doc, "Priorización de modos de falla", 23);
      pdfTable(doc, {
        startY: reportY,
        head: [["Modo de falla", "OT", "%", "% acumulado"]],
        body: metrics.faultPareto.slice(0, 12).map((item) => [
          item.name, integerFormatter.format(item.count), `${formatter.format(item.percent)}%`, `${formatter.format(item.cumulative)}%`
        ]),
        columnStyles: { 0: { cellWidth: 94 }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } }
      });
      reportY = doc.lastAutoTable.finalY + 11;
      reportY = drawPdfSectionTitle(doc, "Activos prioritarios · Jack-Knife", reportY);
      pdfTable(doc, {
        startY: reportY,
        head: [["Equipo", "Tipo", "Crit.", "Fallas", "MTTR JK · h", "Downtime · h", "Riesgo", "Cuadrante"]],
        body: metrics.jackknife.slice(0, 15).map((item) => [
          item.equipment, item.type, item.criticality, integerFormatter.format(item.count), formatter.format(item.mttr),
          formatter.format(item.downtime), formatter.format(item.risk), item.quadrant
        ]),
        styles: { fontSize: 7, cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: 30 }, 2: { cellWidth: 11 }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { cellWidth: 23 } }
      });
      reportY = doc.lastAutoTable.finalY + 11;
      if (reportY > pageHeight - 33) {
        doc.addPage();
        reportY = 23;
      }
      drawPdfSectionTitle(doc, "Criterios y limitaciones", reportY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(82, 98, 116);
      const methodology = [
        "El MTTR se calcula como el promedio de Fecha_fin menos Fecha_inicio para OT correctivas cerradas con duración positiva. La mediana se presenta como medida robusta frente a valores extremos.",
        "El Jack-Knife compara la frecuencia de fallas por equipo y el downtime medio por falla respecto de los promedios globales. Sus cuadrantes son una guía de priorización operacional.",
        "Los resultados dependen de la calidad y cobertura de los registros del CMMS. No se calcula MTBF formal ni disponibilidad basada en tiempo operacional continuo."
      ];
      let methodY = reportY + 9;
      methodology.forEach((paragraph) => {
        const lines = doc.splitTextToSize(`• ${paragraph}`, pageWidth - 30);
        if (methodY + lines.length * 4.5 > pageHeight - 20) {
          doc.addPage();
          methodY = 23;
        }
        doc.text(lines, 14, methodY);
        methodY += lines.length * 4.5 + 4;
      });

      addPdfFooter(doc, pageWidth, pageHeight);
      const safeName = state.fileName.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_");
      doc.save(`Informe_Ejecutivo_Mantenimiento_${safeName}.pdf`);
      setStatus("Informe PDF exportado con los filtros y datos actualmente visibles.", "success");
    } catch (error) {
      console.error(error);
      setStatus(`No se pudo generar el informe PDF: ${error.message || "error inesperado"}`, "error");
    } finally {
      button.disabled = false;
      button.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3.5v11m0 0 4-4m-4 4-4-4M5 16.5v3h14v-3"/></svg> Exportar informe';
    }
  }

  function resetFilters() {
    $("typeFilter").value = "";
    $("criticalityFilter").value = "";
    $("dateFrom").value = "";
    $("dateTo").value = "";
    $("searchFilter").value = "";
    applyFilters();
  }

  function bindEvents() {
    $("fileInput").addEventListener("change", (event) => loadFile(event.target.files?.[0]));
    $("exportPdf").addEventListener("click", exportPdf);
    $("resetFilters").addEventListener("click", resetFilters);
    ["typeFilter", "criticalityFilter", "dateFrom", "dateTo"].forEach((id) => $(id).addEventListener("change", applyFilters));
    $("searchFilter").addEventListener("input", debounce(applyFilters, 180));
    const panel = $("uploadPanel");
    panel.addEventListener("dragover", (event) => { event.preventDefault(); panel.classList.add("drag-over"); });
    panel.addEventListener("dragleave", () => panel.classList.remove("drag-over"));
    panel.addEventListener("drop", (event) => {
      event.preventDefault();
      panel.classList.remove("drag-over");
      loadFile(event.dataTransfer?.files?.[0]);
    });
    document.querySelectorAll(".nav-item").forEach((item) => item.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((link) => link.classList.remove("active"));
      item.classList.add("active");
    }));
  }

  function debounce(callback, delay) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => callback(...args), delay);
    };
  }

  function checkDependencies() {
    const missing = [];
    if (!window.Chart) missing.push("Chart.js");
    if (!window.Papa) missing.push("PapaParse");
    if (!window.XLSX) missing.push("SheetJS");
    if (!window.jspdf?.jsPDF?.API?.autoTable) missing.push("jsPDF-AutoTable");
    if (missing.length) setStatus(`No se pudieron cargar algunas bibliotecas (${missing.join(", ")}). Comprueba la conexión a internet y recarga la página.`, "error");
  }

  bindEvents();
  checkDependencies();
})();
