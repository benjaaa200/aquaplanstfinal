"""Inventario de insumos, movimientos, alertas de stock y solicitudes."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from backend.database import get_db
from backend.models import (
    Instalacion,
    MovimientoInventario,
    ProductoInventario,
    SolicitudInsumo,
    Usuario,
)
from backend.schemas_ops import (
    MovimientoCreate,
    MovimientoUpdate,
    ProductoCreate,
    ProductoUpdate,
    SolicitudCreate,
    SolicitudResolucion,
)
from backend.security import get_current_active_user, require_admin
from backend.services import (
    is_staff,
    notificar_sector,
    notificar_usuarios,
    require_instalacion_access,
    scoped_instalacion_ids,
)

router = APIRouter(prefix="/inventario", tags=["Inventario"])


def serializar_producto(producto: ProductoInventario) -> dict:
    return {
        "id": producto.id,
        "nombre": producto.nombre,
        "codigo": producto.codigo,
        "categoria": producto.categoria,
        "descripcion": producto.descripcion,
        "unidad": producto.unidad,
        "stock": producto.stock,
        "stock_minimo": producto.stock_minimo,
        "ubicacion": producto.ubicacion,
        "activo": producto.activo,
        "stock_bajo": producto.stock <= producto.stock_minimo,
        "agotado": producto.stock <= 0,
        "fecha_creacion": producto.fecha_creacion,
        "fecha_actualizacion": producto.fecha_actualizacion,
    }


def serializar_movimiento(movimiento: MovimientoInventario) -> dict:
    return {
        "id": movimiento.id,
        "producto_id": movimiento.producto_id,
        "producto_nombre": movimiento.producto_nombre,
        "usuario_id": movimiento.usuario_id,
        "usuario_nombre": movimiento.usuario_nombre,
        "tipo": movimiento.tipo,
        "cantidad": movimiento.cantidad,
        "motivo": movimiento.motivo,
        "sector_id": movimiento.sector_id,
        "sector_nombre": movimiento.sector.nombre if movimiento.sector else None,
        "fecha_creacion": movimiento.fecha_creacion,
    }


def serializar_solicitud(solicitud: SolicitudInsumo) -> dict:
    return {
        "id": solicitud.id,
        "producto_id": solicitud.producto_id,
        "producto_nombre": solicitud.producto_nombre,
        "solicitante_id": solicitud.solicitante_id,
        "solicitante_nombre": solicitud.solicitante_nombre,
        "sector_id": solicitud.sector_id,
        "sector_nombre": solicitud.sector.nombre if solicitud.sector else None,
        "cantidad": solicitud.cantidad,
        "motivo": solicitud.motivo,
        "estado": solicitud.estado,
        "fecha_creacion": solicitud.fecha_creacion,
        "fecha_resolucion": solicitud.fecha_resolucion,
    }


def _producto(db: Session, producto_id: int) -> ProductoInventario:
    producto = db.query(ProductoInventario).filter(
        ProductoInventario.id == producto_id
    ).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return producto


def _aplicar_movimiento(
    db: Session,
    producto: ProductoInventario,
    usuario: Usuario,
    tipo: str,
    cantidad: float,
    motivo: str | None,
    sector_id: int | None,
    solicitud_id: int | None = None,
) -> MovimientoInventario:
    if not producto.activo:
        raise HTTPException(status_code=409, detail="El producto está desactivado")
    if tipo == "salida" and producto.stock < cantidad:
        raise HTTPException(
            status_code=409,
            detail=f"Stock insuficiente: disponible {producto.stock} {producto.unidad}",
        )
    if tipo == "entrada":
        producto.stock += cantidad
    elif tipo == "salida":
        producto.stock -= cantidad
    else:
        producto.stock = cantidad
    movimiento = MovimientoInventario(
        producto_id=producto.id,
        usuario_id=usuario.id,
        tipo=tipo,
        cantidad=cantidad,
        motivo=motivo,
        sector_id=sector_id,
        solicitud_id=solicitud_id,
    )
    db.add(movimiento)
    db.flush()
    if producto.stock <= producto.stock_minimo:
        nivel = "agotado" if producto.stock <= 0 else "bajo"
        notificar_sector(
            db,
            sector_id,
            "inventario",
            f"Stock {nivel}: {producto.nombre}",
            f"Quedan {producto.stock} {producto.unidad} (mínimo {producto.stock_minimo}).",
            "urgente" if producto.stock <= 0 else "importante",
            f"../pages/inventario.html?producto={producto.id}",
            "producto",
            producto.id,
        )
    return movimiento


@router.get("/productos")
def listar_productos(
    categoria: str | None = None,
    buscar: str | None = None,
    bajo_stock: bool = False,
    activo: bool | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    query = db.query(ProductoInventario)
    if categoria:
        query = query.filter(ProductoInventario.categoria == categoria)
    if buscar:
        pattern = f"%{buscar.strip()}%"
        query = query.filter(
            ProductoInventario.nombre.like(pattern)
            | ProductoInventario.codigo.like(pattern)
            | ProductoInventario.descripcion.like(pattern)
        )
    if bajo_stock:
        query = query.filter(ProductoInventario.stock <= ProductoInventario.stock_minimo)
    if activo is not None:
        query = query.filter(ProductoInventario.activo.is_(activo))
    return [
        serializar_producto(item)
        for item in query.order_by(ProductoInventario.nombre).all()
    ]


@router.get("/alertas")
def alertas_stock(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    rows = db.query(ProductoInventario).filter(
        ProductoInventario.activo.is_(True),
        ProductoInventario.stock <= ProductoInventario.stock_minimo,
    ).order_by(ProductoInventario.stock).all()
    return {
        "total": len(rows),
        "agotados": sum(1 for item in rows if item.stock <= 0),
        "bajos": sum(1 for item in rows if 0 < item.stock <= item.stock_minimo),
        "productos": [serializar_producto(item) for item in rows],
    }


@router.post("/productos", status_code=status.HTTP_201_CREATED)
def crear_producto(
    payload: ProductoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    producto = ProductoInventario(**payload.model_dump())
    db.add(producto)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="El código ya existe") from exc
    db.refresh(producto)
    return serializar_producto(producto)


@router.put("/productos/{producto_id}")
def actualizar_producto(
    producto_id: int,
    payload: ProductoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    producto = _producto(db, producto_id)
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(producto, campo, valor)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="El código ya existe") from exc
    db.refresh(producto)
    return serializar_producto(producto)


@router.delete("/productos/{producto_id}")
def eliminar_producto(
    producto_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    producto = _producto(db, producto_id)
    has_history = db.query(MovimientoInventario.id).filter(
        MovimientoInventario.producto_id == producto_id
    ).first() or db.query(SolicitudInsumo.id).filter(
        SolicitudInsumo.producto_id == producto_id
    ).first()
    if has_history:
        producto.activo = False
        db.commit()
        return {
            "message": "El producto tiene historial; se desactivó en lugar de eliminarse",
            "desactivado": True,
        }
    db.delete(producto)
    db.commit()
    return {"message": "Producto eliminado", "desactivado": False}


def _movimiento_visible(
    db: Session, usuario: Usuario, movimiento_id: int
) -> MovimientoInventario:
    movimiento = db.query(MovimientoInventario).options(
        joinedload(MovimientoInventario.producto),
        joinedload(MovimientoInventario.usuario),
        joinedload(MovimientoInventario.sector),
    ).filter(MovimientoInventario.id == movimiento_id).first()
    if not movimiento:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")
    if not is_staff(usuario):
        scope = scoped_instalacion_ids(db, usuario)
        if scope is not None and movimiento.sector_id not in scope:
            raise HTTPException(status_code=403, detail="No tienes acceso a este movimiento")
    return movimiento


@router.get("/movimientos")
def listar_movimientos(
    producto_id: int | None = None,
    tipo: str | None = None,
    sector_id: int | None = None,
    fecha_inicio: datetime | None = None,
    fecha_fin: datetime | None = None,
    limit: int = Query(default=300, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    query = db.query(MovimientoInventario).options(
        joinedload(MovimientoInventario.producto),
        joinedload(MovimientoInventario.usuario),
        joinedload(MovimientoInventario.sector),
    )
    if not is_staff(current_user):
        scope = scoped_instalacion_ids(db, current_user)
        if scope is not None:
            query = query.filter(MovimientoInventario.sector_id.in_(scope))
    if producto_id:
        query = query.filter(MovimientoInventario.producto_id == producto_id)
    if tipo:
        query = query.filter(MovimientoInventario.tipo == tipo)
    if sector_id:
        query = query.filter(MovimientoInventario.sector_id == sector_id)
    if fecha_inicio:
        query = query.filter(MovimientoInventario.fecha_creacion >= fecha_inicio)
    if fecha_fin:
        query = query.filter(MovimientoInventario.fecha_creacion <= fecha_fin)
    return [
        serializar_movimiento(item)
        for item in query.order_by(
            MovimientoInventario.fecha_creacion.desc()
        ).limit(limit).all()
    ]


@router.get("/movimientos/{movimiento_id}")
def obtener_movimiento(
    movimiento_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    return serializar_movimiento(_movimiento_visible(db, current_user, movimiento_id))


@router.post("/movimientos", status_code=status.HTTP_201_CREATED)
def registrar_movimiento(
    payload: MovimientoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    if not is_staff(current_user):
        raise HTTPException(
            status_code=403,
            detail="Registra una solicitud de insumos en lugar de modificar el inventario",
        )
    producto = _producto(db, payload.producto_id)
    if not producto.activo:
        raise HTTPException(status_code=409, detail="El producto está desactivado")
    if payload.sector_id:
        if not db.query(Instalacion.id).filter(Instalacion.id == payload.sector_id).first():
            raise HTTPException(status_code=422, detail="Sector no encontrado")
        require_instalacion_access(db, current_user, payload.sector_id)
    movimiento = _aplicar_movimiento(
        db,
        producto,
        current_user,
        payload.tipo,
        payload.cantidad,
        payload.motivo,
        payload.sector_id,
    )
    db.commit()
    db.refresh(movimiento)
    return serializar_movimiento(movimiento)


@router.put("/movimientos/{movimiento_id}")
def actualizar_movimiento(
    movimiento_id: int,
    payload: MovimientoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    """Corrige los metadatos de un movimiento sin alterar el stock."""
    movimiento = _movimiento_visible(db, current_user, movimiento_id)
    datos = payload.model_dump(exclude_unset=True)
    sector_id = datos.get("sector_id")
    if sector_id is not None:
        if not db.query(Instalacion.id).filter(Instalacion.id == sector_id).first():
            raise HTTPException(status_code=422, detail="Sector no encontrado")
        require_instalacion_access(db, current_user, sector_id)
    for campo, valor in datos.items():
        setattr(movimiento, campo, valor)
    db.commit()
    db.refresh(movimiento)
    return serializar_movimiento(movimiento)


@router.delete("/movimientos/{movimiento_id}")
def eliminar_movimiento(
    movimiento_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    """Elimina un movimiento y revierte su efecto sobre el stock."""
    movimiento = _movimiento_visible(db, current_user, movimiento_id)
    producto = _producto(db, movimiento.producto_id)
    if movimiento.tipo == "entrada":
        if producto.stock < movimiento.cantidad:
            raise HTTPException(
                status_code=409,
                detail="Stock insuficiente para revertir la entrada",
            )
        producto.stock -= movimiento.cantidad
    elif movimiento.tipo == "salida":
        producto.stock += movimiento.cantidad
    else:
        raise HTTPException(
            status_code=409,
            detail="Los ajustes no se pueden eliminar porque no registran el stock previo",
        )
    db.delete(movimiento)
    db.commit()
    return {"message": "Movimiento eliminado", "stock_actual": producto.stock}


def _solicitud_visible(
    db: Session, usuario: Usuario, solicitud_id: int
) -> SolicitudInsumo:
    solicitud = db.query(SolicitudInsumo).options(
        joinedload(SolicitudInsumo.producto),
        joinedload(SolicitudInsumo.solicitante),
        joinedload(SolicitudInsumo.sector),
    ).filter(SolicitudInsumo.id == solicitud_id).first()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    if not is_staff(usuario):
        if solicitud.solicitante_id != usuario.id:
            raise HTTPException(status_code=403, detail="No tienes acceso a esta solicitud")
    else:
        scope = scoped_instalacion_ids(db, usuario)
        if scope is not None and solicitud.sector_id not in scope:
            raise HTTPException(status_code=403, detail="No tienes acceso a esta solicitud")
    return solicitud


@router.get("/solicitudes")
def listar_solicitudes(
    estado: str | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    query = db.query(SolicitudInsumo).options(
        joinedload(SolicitudInsumo.producto),
        joinedload(SolicitudInsumo.solicitante),
        joinedload(SolicitudInsumo.sector),
    )
    if not is_staff(current_user):
        query = query.filter(SolicitudInsumo.solicitante_id == current_user.id)
    elif is_staff(current_user):
        scope = scoped_instalacion_ids(db, current_user)
        if scope is not None:
            query = query.filter(SolicitudInsumo.sector_id.in_(scope))
    if estado:
        query = query.filter(SolicitudInsumo.estado == estado)
    return [
        serializar_solicitud(item)
        for item in query.order_by(SolicitudInsumo.fecha_creacion.desc()).all()
    ]


@router.get("/solicitudes/{solicitud_id}")
def obtener_solicitud(
    solicitud_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    return serializar_solicitud(_solicitud_visible(db, current_user, solicitud_id))


@router.post("/solicitudes", status_code=status.HTTP_201_CREATED)
def crear_solicitud(
    payload: SolicitudCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    producto = _producto(db, payload.producto_id)
    if not producto.activo:
        raise HTTPException(status_code=409, detail="El producto está desactivado")
    if payload.sector_id:
        if not db.query(Instalacion.id).filter(Instalacion.id == payload.sector_id).first():
            raise HTTPException(status_code=422, detail="Sector no encontrado")
        require_instalacion_access(db, current_user, payload.sector_id)
    solicitud = SolicitudInsumo(
        producto_id=payload.producto_id,
        solicitante_id=current_user.id,
        sector_id=payload.sector_id,
        cantidad=payload.cantidad,
        motivo=payload.motivo,
        estado="pendiente",
    )
    db.add(solicitud)
    db.flush()
    notificar_sector(
        db,
        payload.sector_id,
        "inventario",
        "Nueva solicitud de insumos",
        f"{current_user.nombre_completo or current_user.username}: "
        f"{payload.cantidad} {producto.unidad} de {producto.nombre}",
        "importante",
        "../pages/inventario.html?tab=solicitudes",
        "solicitud",
        solicitud.id,
    )
    db.commit()
    db.refresh(solicitud)
    return serializar_solicitud(solicitud)


@router.put("/solicitudes/{solicitud_id}")
def resolver_solicitud(
    solicitud_id: int,
    payload: SolicitudResolucion,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    if not is_staff(current_user):
        raise HTTPException(status_code=403, detail="No puedes resolver solicitudes")
    solicitud = db.query(SolicitudInsumo).options(
        joinedload(SolicitudInsumo.producto),
        joinedload(SolicitudInsumo.solicitante),
        joinedload(SolicitudInsumo.sector),
    ).filter(SolicitudInsumo.id == solicitud_id).first()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    if solicitud.estado != "pendiente":
        raise HTTPException(status_code=409, detail="La solicitud ya fue resuelta")
    scope = scoped_instalacion_ids(db, current_user)
    if scope is not None and solicitud.sector_id not in scope:
        raise HTTPException(status_code=403, detail="No tienes acceso a esta solicitud")

    if payload.estado == "aprobada":
        producto = solicitud.producto
        _aplicar_movimiento(
            db,
            producto,
            current_user,
            "salida",
            solicitud.cantidad,
            f"Solicitud #{solicitud.id}: {payload.comentario or solicitud.motivo or ''}".strip(),
            solicitud.sector_id,
            solicitud.id,
        )
    solicitud.estado = payload.estado
    solicitud.resuelto_por = current_user.id
    solicitud.fecha_resolucion = datetime.utcnow()
    notificar_usuarios(
        db,
        [solicitud.solicitante_id],
        "inventario",
        f"Solicitud {payload.estado}",
        f"{solicitud.producto.nombre}: {payload.comentario or 'Sin comentario'}",
        "importante",
        "../pages/inventario.html?tab=solicitudes",
        "solicitud",
        solicitud.id,
    )
    db.commit()
    db.refresh(solicitud)
    return serializar_solicitud(solicitud)


@router.delete("/solicitudes/{solicitud_id}")
def eliminar_solicitud(
    solicitud_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    solicitud = _solicitud_visible(db, current_user, solicitud_id)
    if not is_staff(current_user) and solicitud.estado != "pendiente":
        raise HTTPException(
            status_code=409,
            detail="Solo el personal puede eliminar solicitudes resueltas",
        )
    if solicitud.estado == "aprobada":
        movimiento = db.query(MovimientoInventario).filter(
            MovimientoInventario.solicitud_id == solicitud.id,
            MovimientoInventario.tipo == "salida",
        ).first()
        if movimiento:
            producto = _producto(db, movimiento.producto_id)
            producto.stock += movimiento.cantidad
            db.add(MovimientoInventario(
                producto_id=movimiento.producto_id,
                usuario_id=current_user.id,
                tipo="entrada",
                cantidad=movimiento.cantidad,
                motivo=f"Reversión por eliminación de solicitud #{solicitud.id}",
                sector_id=movimiento.sector_id,
            ))
            movimiento.solicitud_id = None
    db.delete(solicitud)
    db.commit()
    return {"message": "Solicitud eliminada"}
