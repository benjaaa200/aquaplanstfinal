"""Fichas agronomicas de referencia para cultivos hidroponicos.

Los valores son rangos orientativos de manejo, no recetas cerradas. Cada ficha
incluye etapas, duracion estimada y parametros objetivo para que el productor
no tenga que inventar fechas ni umbrales desde cero.
"""
from datetime import date, datetime
from typing import Optional


CROP_CATALOG = [
    {
        "clave": "lechuga",
        "nombre": "Lechuga",
        "nombre_cientifico": "Lactuca sativa",
        "familia": "Asteraceae",
        "descripcion": "Hortaliza de hoja de ciclo corto, ideal para sistemas NFT o raiz flotante.",
        "dificultad": "facil",
        "dias_ciclo": 55,
        "ph": {"min": 5.5, "max": 6.5},
        "ec": {"min": 1.2, "max": 1.8},
        "temperatura": {"min": 15, "max": 24},
        "humedad": {"min": 55, "max": 75},
        "notas": "Mantener buena oxigenacion de la solucion nutritiva. Evitar temperaturas de agua sobre 24 C.",
        "etapas": [
            {
                "clave": "germinacion",
                "nombre": "Germinacion",
                "dias": 7,
                "ph": {"min": 5.8, "max": 6.2},
                "ec": {"min": 0.4, "max": 0.8},
                "temperatura": {"min": 18, "max": 22},
                "humedad": {"min": 70, "max": 85},
                "notas": "Sustrato humedo y luz suave; no saturar.",
            },
            {
                "clave": "plantula",
                "nombre": "Plantula",
                "dias": 14,
                "ec": {"min": 0.8, "max": 1.2},
                "temperatura": {"min": 16, "max": 22},
                "humedad": {"min": 65, "max": 80},
                "notas": "Subir EC de forma gradual y vigilar raices.",
            },
            {
                "clave": "crecimiento",
                "nombre": "Crecimiento",
                "dias": 27,
                "notas": "Etapa de mayor consumo de agua y nutrientes.",
            },
            {
                "clave": "cosecha",
                "nombre": "Cosecha",
                "dias": 7,
                "temperatura": {"min": 14, "max": 22},
                "notas": "Cosechar en las horas mas frescas para conservar turgencia.",
            },
        ],
    },
    {
        "clave": "espinaca",
        "nombre": "Espinaca",
        "nombre_cientifico": "Spinacia oleracea",
        "familia": "Amaranthaceae",
        "descripcion": "Hoja verde de clima fresco, sensible al calor y al espigado temprano.",
        "dificultad": "facil",
        "dias_ciclo": 50,
        "ph": {"min": 6.0, "max": 7.0},
        "ec": {"min": 1.8, "max": 2.3},
        "temperatura": {"min": 15, "max": 22},
        "humedad": {"min": 60, "max": 75},
        "notas": "Evitar temperaturas sobre 24 C; favorece floracion prematura.",
        "etapas": [
            {
                "clave": "germinacion",
                "nombre": "Germinacion",
                "dias": 7,
                "ph": {"min": 6.0, "max": 6.8},
                "ec": {"min": 0.6, "max": 1.0},
                "temperatura": {"min": 15, "max": 20},
                "humedad": {"min": 70, "max": 85},
            },
            {
                "clave": "plantula",
                "nombre": "Plantula",
                "dias": 14,
                "ec": {"min": 1.2, "max": 1.8},
                "temperatura": {"min": 14, "max": 21},
                "humedad": {"min": 65, "max": 80},
            },
            {
                "clave": "crecimiento",
                "nombre": "Crecimiento",
                "dias": 22,
                "notas": "Vigilar pH alto: reduce disponibilidad de hierro.",
            },
            {
                "clave": "cosecha",
                "nombre": "Cosecha",
                "dias": 7,
                "notas": "Cortar hojas externas si se busca cosecha escalonada.",
            },
        ],
    },
    {
        "clave": "rucula",
        "nombre": "Rucula",
        "nombre_cientifico": "Eruca vesicaria",
        "familia": "Brassicaceae",
        "descripcion": "Hoja de crecimiento rapido y sabor intenso, adecuada para ciclos cortos.",
        "dificultad": "facil",
        "dias_ciclo": 35,
        "ph": {"min": 5.8, "max": 6.5},
        "ec": {"min": 1.0, "max": 1.6},
        "temperatura": {"min": 15, "max": 22},
        "humedad": {"min": 60, "max": 75},
        "notas": "Cosechar joven para evitar hojas fibrosas y sabor demasiado picante.",
        "etapas": [
            {
                "clave": "germinacion",
                "nombre": "Germinacion",
                "dias": 5,
                "ph": {"min": 6.0, "max": 6.5},
                "ec": {"min": 0.5, "max": 0.9},
                "temperatura": {"min": 15, "max": 21},
                "humedad": {"min": 70, "max": 85},
            },
            {
                "clave": "plantula",
                "nombre": "Plantula",
                "dias": 10,
                "ec": {"min": 0.9, "max": 1.3},
                "temperatura": {"min": 14, "max": 21},
                "humedad": {"min": 65, "max": 80},
            },
            {
                "clave": "crecimiento",
                "nombre": "Crecimiento",
                "dias": 15,
            },
            {
                "clave": "cosecha",
                "nombre": "Cosecha",
                "dias": 5,
            },
        ],
    },
    {
        "clave": "albahaca",
        "nombre": "Albahaca",
        "nombre_cientifico": "Ocimum basilicum",
        "familia": "Lamiaceae",
        "descripcion": "Aromatica de clima calido; responde bien al despunte y cosecha frecuente.",
        "dificultad": "media",
        "dias_ciclo": 65,
        "ph": {"min": 5.5, "max": 6.5},
        "ec": {"min": 1.0, "max": 1.6},
        "temperatura": {"min": 18, "max": 26},
        "humedad": {"min": 60, "max": 75},
        "notas": "Evitar encharcamiento y corrientes de aire frio. Despuntar para estimular ramificacion.",
        "etapas": [
            {
                "clave": "germinacion",
                "nombre": "Germinacion",
                "dias": 10,
                "ph": {"min": 5.8, "max": 6.3},
                "ec": {"min": 0.5, "max": 0.9},
                "temperatura": {"min": 20, "max": 26},
                "humedad": {"min": 70, "max": 85},
            },
            {
                "clave": "plantula",
                "nombre": "Plantula",
                "dias": 15,
                "ec": {"min": 0.8, "max": 1.2},
                "temperatura": {"min": 18, "max": 25},
                "humedad": {"min": 65, "max": 80},
            },
            {
                "clave": "crecimiento",
                "nombre": "Crecimiento",
                "dias": 30,
                "notas": "Realizar despuntes y retirar flores para priorizar hojas.",
            },
            {
                "clave": "cosecha",
                "nombre": "Cosecha",
                "dias": 10,
            },
        ],
    },
    {
        "clave": "cilantro",
        "nombre": "Cilantro",
        "nombre_cientifico": "Coriandrum sativum",
        "familia": "Apiaceae",
        "descripcion": "Aromatica de ciclo corto, sensible al calor y al espigado.",
        "dificultad": "media",
        "dias_ciclo": 55,
        "ph": {"min": 6.0, "max": 7.0},
        "ec": {"min": 1.0, "max": 1.6},
        "temperatura": {"min": 15, "max": 22},
        "humedad": {"min": 55, "max": 70},
        "notas": "Sembrar escalonado para mantener produccion continua.",
        "etapas": [
            {
                "clave": "germinacion",
                "nombre": "Germinacion",
                "dias": 10,
                "ph": {"min": 6.0, "max": 6.8},
                "ec": {"min": 0.5, "max": 0.9},
                "temperatura": {"min": 16, "max": 22},
                "humedad": {"min": 65, "max": 80},
            },
            {
                "clave": "plantula",
                "nombre": "Plantula",
                "dias": 15,
                "ec": {"min": 0.9, "max": 1.3},
                "temperatura": {"min": 15, "max": 22},
                "humedad": {"min": 60, "max": 75},
            },
            {
                "clave": "crecimiento",
                "nombre": "Crecimiento",
                "dias": 22,
            },
            {
                "clave": "cosecha",
                "nombre": "Cosecha",
                "dias": 8,
            },
        ],
    },
    {
        "clave": "tomate_cherry",
        "nombre": "Tomate cherry",
        "nombre_cientifico": "Solanum lycopersicum var. cerasiforme",
        "familia": "Solanaceae",
        "descripcion": "Cultivo de fruto con ciclo largo; requiere tutoreo y manejo de polinizacion.",
        "dificultad": "avanzada",
        "dias_ciclo": 120,
        "ph": {"min": 5.5, "max": 6.5},
        "ec": {"min": 2.0, "max": 3.5},
        "temperatura": {"min": 18, "max": 27},
        "humedad": {"min": 60, "max": 75},
        "notas": "Controlar humedad para prevenir Botrytis. Aumentar EC gradualmente durante fructificacion.",
        "etapas": [
            {
                "clave": "germinacion",
                "nombre": "Germinacion",
                "dias": 10,
                "ph": {"min": 5.8, "max": 6.3},
                "ec": {"min": 0.6, "max": 1.0},
                "temperatura": {"min": 20, "max": 26},
                "humedad": {"min": 70, "max": 85},
            },
            {
                "clave": "plantula",
                "nombre": "Plantula",
                "dias": 25,
                "ec": {"min": 1.2, "max": 2.0},
                "temperatura": {"min": 18, "max": 25},
                "humedad": {"min": 65, "max": 80},
            },
            {
                "clave": "vegetativo",
                "nombre": "Crecimiento vegetativo",
                "dias": 35,
                "ec": {"min": 1.8, "max": 2.8},
                "notas": "Guiar tallos y eliminar brotes laterales segun conduccion.",
            },
            {
                "clave": "floracion",
                "nombre": "Floracion y cuaja",
                "dias": 30,
                "ec": {"min": 2.0, "max": 3.2},
                "humedad": {"min": 55, "max": 70},
                "notas": "Facilitar ventilacion y polinizacion con vibracion suave.",
            },
            {
                "clave": "cosecha",
                "nombre": "Cosecha",
                "dias": 20,
                "ec": {"min": 2.0, "max": 3.5},
                "notas": "Cosechar racimos maduros de forma escalonada.",
            },
        ],
    },
    {
        "clave": "frutilla",
        "nombre": "Frutilla",
        "nombre_cientifico": "Fragaria x ananassa",
        "familia": "Rosaceae",
        "descripcion": "Cultivo de fruto perenne de ciclo largo, exigente en calidad de raiz y drenaje.",
        "dificultad": "avanzada",
        "dias_ciclo": 150,
        "ph": {"min": 5.5, "max": 6.5},
        "ec": {"min": 1.2, "max": 2.0},
        "temperatura": {"min": 16, "max": 24},
        "humedad": {"min": 65, "max": 80},
        "notas": "Sustrato aireado y control estricto de humedad para evitar pudriciones de corona.",
        "etapas": [
            {
                "clave": "establecimiento",
                "nombre": "Establecimiento",
                "dias": 20,
                "ec": {"min": 0.8, "max": 1.2},
                "temperatura": {"min": 16, "max": 23},
                "humedad": {"min": 70, "max": 85},
            },
            {
                "clave": "vegetativo",
                "nombre": "Crecimiento vegetativo",
                "dias": 40,
                "ec": {"min": 1.0, "max": 1.6},
            },
            {
                "clave": "floracion",
                "nombre": "Floracion",
                "dias": 30,
                "ec": {"min": 1.2, "max": 1.8},
                "humedad": {"min": 60, "max": 75},
            },
            {
                "clave": "fructificacion",
                "nombre": "Fructificacion",
                "dias": 40,
                "ec": {"min": 1.4, "max": 2.0},
                "notas": "Cosechar con frecuencia y retirar frutos enfermos.",
            },
            {
                "clave": "cosecha",
                "nombre": "Cosecha",
                "dias": 20,
                "ec": {"min": 1.2, "max": 1.8},
            },
        ],
    },
    {
        "clave": "pepino",
        "nombre": "Pepino",
        "nombre_cientifico": "Cucumis sativus",
        "familia": "Cucurbitaceae",
        "descripcion": "Cultivo de fruto de crecimiento rapido y alto consumo de agua.",
        "dificultad": "media",
        "dias_ciclo": 75,
        "ph": {"min": 5.5, "max": 6.5},
        "ec": {"min": 1.8, "max": 2.5},
        "temperatura": {"min": 20, "max": 28},
        "humedad": {"min": 65, "max": 80},
        "notas": "Tutoreo y despunte segun variedad. Vigilar deficiencias de magnesio en fructificacion.",
        "etapas": [
            {
                "clave": "germinacion",
                "nombre": "Germinacion",
                "dias": 7,
                "ph": {"min": 5.8, "max": 6.3},
                "ec": {"min": 0.6, "max": 1.0},
                "temperatura": {"min": 22, "max": 28},
                "humedad": {"min": 70, "max": 85},
            },
            {
                "clave": "plantula",
                "nombre": "Plantula",
                "dias": 14,
                "ec": {"min": 1.2, "max": 1.8},
                "temperatura": {"min": 20, "max": 26},
                "humedad": {"min": 65, "max": 80},
            },
            {
                "clave": "vegetativo",
                "nombre": "Crecimiento vegetativo",
                "dias": 25,
                "ec": {"min": 1.6, "max": 2.2},
                "notas": "Guiar el tallo principal y mantener ventilacion.",
            },
            {
                "clave": "fructificacion",
                "nombre": "Floracion y fructificacion",
                "dias": 19,
                "ec": {"min": 1.8, "max": 2.5},
                "notas": "Cosechar joven para estimular nueva cuaja.",
            },
            {
                "clave": "cosecha",
                "nombre": "Cosecha",
                "dias": 10,
            },
        ],
    },
]


def _as_date(value) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return None


def get_templates() -> list:
    """Return a deep-enough copy so callers cannot mutate catalog state."""
    return [dict(template) for template in CROP_CATALOG]


def find_template(clave: Optional[str]):
    if not clave:
        return None
    normalized = str(clave).strip().lower()
    for template in CROP_CATALOG:
        if template["clave"] == normalized:
            return template
    return None


def resolve_template(clave: Optional[str] = None, nombre: Optional[str] = None):
    template = find_template(clave)
    if template:
        return template
    if nombre:
        normalized = str(nombre).strip().lower()
        for item in CROP_CATALOG:
            if item["nombre"].lower() == normalized:
                return item
    return None


def _stage_params(template: dict, stage: dict) -> dict:
    return {
        key: dict(stage.get(key) or template.get(key) or {})
        for key in ("ph", "ec", "temperatura", "humedad")
    }


def stage_for_crop(
    template: dict,
    fecha_inicio,
    now: Optional[datetime] = None,
    etapa_manual: Optional[str] = None,
) -> Optional[dict]:
    """Return the lifecycle stage calculated from the start date."""
    if not template:
        return None
    start = _as_date(fecha_inicio)
    if not start:
        return None

    stages = template["etapas"]
    total_dias = int(template.get("dias_ciclo") or sum(stage["dias"] for stage in stages))
    elapsed = max(0, ((_as_date(now) or date.today()) - start).days)

    current_index = len(stages) - 1
    stage_start = 0
    accumulated = 0
    for index, stage in enumerate(stages):
        if elapsed < accumulated + int(stage["dias"]):
            current_index = index
            stage_start = accumulated
            break
        accumulated += int(stage["dias"])

    if etapa_manual:
        manual = str(etapa_manual).strip().lower()
        for index, stage in enumerate(stages):
            if stage["clave"] == manual:
                current_index = index
                stage_start = sum(int(item["dias"]) for item in stages[:index])
                break

    current = stages[current_index]
    dias_etapa = int(current["dias"])
    dias_en_etapa = max(0, min(dias_etapa, elapsed - stage_start))
    progreso = max(0, min(100, round((elapsed / total_dias) * 100)))

    siguiente = stages[current_index + 1] if current_index + 1 < len(stages) else None
    return {
        "clave": current["clave"],
        "nombre": current["nombre"],
        "indice": current_index + 1,
        "total_etapas": len(stages),
        "dias_etapa": dias_etapa,
        "dias_en_etapa": dias_en_etapa,
        "progreso_ciclo": progreso,
        "dias_para_cosecha": max(0, total_dias - elapsed),
        "es_manual": bool(etapa_manual),
        "siguiente": siguiente["nombre"] if siguiente else None,
        "parametros": _stage_params(template, current),
        "notas": current.get("notas") or "",
    }


def catalog_detail(
    template: dict,
    fecha_inicio=None,
    now: Optional[datetime] = None,
    etapa_manual: Optional[str] = None,
) -> dict:
    etapa = stage_for_crop(template, fecha_inicio, now=now, etapa_manual=etapa_manual)
    etapas = []
    for stage in template["etapas"]:
        etapas.append(
            {
                "clave": stage["clave"],
                "nombre": stage["nombre"],
                "dias": stage["dias"],
                "parametros": _stage_params(template, stage),
                "notas": stage.get("notas") or "",
            }
        )

    return {
        "clave": template["clave"],
        "nombre": template["nombre"],
        "nombre_cientifico": template["nombre_cientifico"],
        "familia": template["familia"],
        "descripcion": template["descripcion"],
        "dificultad": template["dificultad"],
        "dias_ciclo": template["dias_ciclo"],
        "notas": template["notas"],
        "etapas": etapas,
        "etapa_actual": etapa,
    }


def suggested_dates(template: dict, fecha_inicio) -> dict:
    start = _as_date(fecha_inicio)
    if not template or not start:
        return {}
    from datetime import timedelta

    return {
        "dias_ciclo": template["dias_ciclo"],
        "fecha_estimada_cosecha": start + timedelta(days=int(template["dias_ciclo"])),
    }


TARGET_VARIABLES = {
    "temperatura": {
        "source": "temperatura",
        "nombre": "Temperatura",
        "unidad": "°C",
        "factor": 1,
    },
    "humedad": {
        "source": "humedad",
        "nombre": "Humedad relativa",
        "unidad": "%",
        "factor": 1,
    },
    "ph": {
        "source": "ph",
        "nombre": "pH",
        "unidad": "",
        "factor": 1,
    },
    "conductividad": {
        "source": "ec",
        "nombre": "Conductividad eléctrica",
        "unidad": "µS/cm",
        "factor": 1000,
    },
}


def catalog_targets(cultivo, now: Optional[datetime] = None) -> dict:
    """Return effective catalog ranges for the crop's current stage.

    EC is stored in mS/cm in the catalog and converted to µS/cm because that is
    the unit used by sensor measurements and configured thresholds.
    """
    template = resolve_template(
        getattr(cultivo, "especie_clave", None),
        getattr(cultivo, "tipo_planta", None),
    )
    stage = stage_for_crop(
        template,
        getattr(cultivo, "fecha_inicio", None),
        now=now,
        etapa_manual=getattr(cultivo, "etapa", None),
    )
    if not stage:
        return {}

    targets = {}
    for variable, meta in TARGET_VARIABLES.items():
        source = stage["parametros"].get(meta["source"]) or {}
        minimo = source.get("min")
        maximo = source.get("max")
        if minimo is None and maximo is None:
            continue
        factor = meta["factor"]
        targets[variable] = {
            "nombre": meta["nombre"],
            "unidad": meta["unidad"],
            "minimo": minimo * factor if minimo is not None else None,
            "maximo": maximo * factor if maximo is not None else None,
            "origen": "catalogo",
            "etapa": stage["nombre"],
            "etapa_clave": stage["clave"],
        }
    return targets


def evaluate_measurement_targets(cultivo, medicion=None, now=None) -> Optional[dict]:
    """Compare the latest measurement with the active stage target ranges."""
    targets = catalog_targets(cultivo, now=now)
    if not targets:
        return None

    parametros = []
    fuera_rango = 0
    con_dato = 0
    etapa = None
    etapa_clave = None
    for variable, config in targets.items():
        etapa = etapa or config.get("etapa")
        etapa_clave = etapa_clave or config.get("etapa_clave")
        valor = getattr(medicion, variable, None) if medicion is not None else None
        estado = "sin_dato"
        limite = None
        if valor is not None:
            con_dato += 1
            minimo = config.get("minimo")
            maximo = config.get("maximo")
            if minimo is not None and valor < minimo:
                estado = "bajo"
                limite = minimo
            elif maximo is not None and valor > maximo:
                estado = "alto"
                limite = maximo
            else:
                estado = "ok"
            if estado != "ok":
                fuera_rango += 1
        parametros.append(
            {
                "variable": variable,
                "nombre": config["nombre"],
                "unidad": config["unidad"],
                "valor": valor,
                "minimo": config.get("minimo"),
                "maximo": config.get("maximo"),
                "estado": estado,
                "limite": limite,
            }
        )

    if con_dato == 0:
        estado_general = "sin_mediciones"
    elif fuera_rango:
        estado_general = "atencion"
    else:
        estado_general = "ok"

    return {
        "estado": estado_general,
        "etapa": etapa,
        "etapa_clave": etapa_clave,
        "fuera_rango": fuera_rango,
        "parametros": parametros,
    }
