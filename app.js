let db = null;
let carrito = [];
let empleadoActual = localStorage.getItem("empleadoActual") || null;

// Mostrar mensajes de depuración en la pantalla (para saber qué pasa)
function mostrarMensaje(texto, esError = false) {
    let div = document.getElementById("mensajesDepuracion");
    if (!div) {
        div = document.createElement("div");
        div.id = "mensajesDepuracion";
        div.style.position = "fixed";
        div.style.bottom = "60px";
        div.style.left = "10px";
        div.style.right = "10px";
        div.style.backgroundColor = esError ? "#ffcccc" : "#ccffcc";
        div.style.border = "1px solid #888";
        div.style.padding = "5px";
        div.style.fontSize = "12px";
        div.style.zIndex = "9999";
        document.body.appendChild(div);
    }
    div.innerHTML = texto;
    setTimeout(() => { if (div) div.innerHTML = ""; }, 5000);
}

function conectarDB() {
    return new Promise((resolve, reject) => {
        if (db) { resolve(db); return; }
        const request = indexedDB.open("TiendaDB", 3);
        request.onupgradeneeded = (e) => {
            db = e.target.result;
            if (!db.objectStoreNames.contains("productos")) {
                const store = db.createObjectStore("productos", { keyPath: "id", autoIncrement: true });
                store.createIndex("nombre", "nombre");
                store.add({ nombre: "Arroz", tipo: "granel", precio_kg: 2.5, stock_kg: 50 });
                store.add({ nombre: "Lata de atún", tipo: "unidad", precio_unidad: 1.2, stock_unidades: 30 });
                console.log("Productos de ejemplo creados");
                mostrarMensaje("Base de datos inicializada con productos de ejemplo", false);
            }
            if (!db.objectStoreNames.contains("ventas")) {
                db.createObjectStore("ventas", { keyPath: "id", autoIncrement: true });
            }
        };
        request.onsuccess = (e) => {
            db = e.target.result;
            window.db = db; // para que otros scripts puedan acceder si quieren
            console.log("Base de datos conectada");
            resolve(db);
        };
        request.onerror = (e) => reject(e.target.error);
    });
}

async function cargarProductos(filtro = "") {
    const grid = document.getElementById("listaProductos");
    if (!grid) return;
    grid.innerHTML = "Cargando productos...";
    try {
        await conectarDB();
        const tx = db.transaction("productos", "readonly");
        const productos = await new Promise((resolve, reject) => {
            const req = tx.objectStore("productos").getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        console.log("Productos obtenidos:", productos);
        if (!productos || productos.length === 0) {
            grid.innerHTML = "<p>⚠️ No hay productos. Intente 'Forzar recarga' o vaya a Inventario y use 'Resetear DB'.</p>";
            return;
        }
        let filtrados = filtro ? productos.filter(p => p.nombre.toLowerCase().includes(filtro.toLowerCase())) : productos;
        if (filtrados.length === 0) {
            grid.innerHTML = "<p>No se encontraron productos con ese nombre.</p>";
            return;
        }
        grid.innerHTML = "";
        filtrados.forEach(p => {
            const card = document.createElement("div");
            card.className = "producto-card";
            let precio = (p.tipo === "granel") ? `$${p.precio_kg}/kg` : `$${p.precio_unidad}/ud`;
            let stock = (p.tipo === "granel") ? `${p.stock_kg} kg` : `${p.stock_unidades} ud`;
            card.innerHTML = `
                <strong>${p.nombre}</strong><br>
                <small>${precio}</small><br>
                <small>Stock: ${stock}</small>
                <button data-id="${p.id}" class="agregar-carrito">➕ Agregar</button>
            `;
            grid.appendChild(card);
        });
        // Eventos de botones agregar
        document.querySelectorAll(".agregar-carrito").forEach(btn => {
            btn.onclick = () => agregarAlCarrito(parseInt(btn.dataset.id));
        });
    } catch (e) {
        console.error(e);
        grid.innerHTML = `<p style="color:red">Error al cargar productos: ${e.message}</p>`;
        mostrarMensaje("Error: " + e.message, true);
    }
}

async function agregarAlCarrito(id) {
    await conectarDB();
    const tx = db.transaction("productos", "readonly");
    const producto = await new Promise((resolve, reject) => {
        const req = tx.objectStore("productos").get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    if (!producto) return;
    if (producto.tipo === "unidad") {
        let cant = parseInt(prompt("Cantidad de unidades:", "1"));
        if (isNaN(cant) || cant <= 0) return;
        if (cant > producto.stock_unidades) return alert("Stock insuficiente");
        carrito.push({ id, nombre: producto.nombre, tipo: "unidad", cantidad: cant, precio: producto.precio_unidad, subtotal: cant * producto.precio_unidad });
    } else {
        let peso = parseFloat(prompt("Peso en kg:", "0.5"));
        if (isNaN(peso) || peso <= 0) return;
        if (peso > producto.stock_kg) return alert("Stock insuficiente");
        carrito.push({ id, nombre: producto.nombre, tipo: "granel", peso_kg: peso, precio_kg: producto.precio_kg, subtotal: peso * producto.precio_kg });
    }
    actualizarCarrito();
}

function actualizarCarrito() {
    const contenedor = document.getElementById("carritoItems");
    const totalSpan = document.getElementById("totalCarrito");
    if (!contenedor) return;
    if (carrito.length === 0) {
        contenedor.innerHTML = "<em>Carrito vacío</em>";
        totalSpan.innerText = "0";
        return;
    }
    let html = "", total = 0;
    carrito.forEach((item, idx) => {
        total += item.subtotal;
        if (item.tipo === "unidad") {
            html += `<div>${item.nombre} x${item.cantidad} = $${item.subtotal.toFixed(2)} <button data-idx="${idx}" class="eliminar-item">❌</button></div>`;
        } else {
            html += `<div>${item.nombre} ${item.peso_kg}kg = $${item.subtotal.toFixed(2)} <button data-idx="${idx}" class="eliminar-item">❌</button></div>`;
        }
    });
    contenedor.innerHTML = html;
    totalSpan.innerText = total.toFixed(2);
    document.querySelectorAll(".eliminar-item").forEach(btn => {
        btn.onclick = () => { carrito.splice(parseInt(btn.dataset.idx), 1); actualizarCarrito(); };
    });
}

async function confirmarVenta() {
    if (carrito.length === 0) return alert("Carrito vacío");
    empleadoActual = localStorage.getItem("empleadoActual");
    if (!empleadoActual) return alert("Debes iniciar turno en la pestaña Turno");
    await conectarDB();
    // Descontar stock
    for (let item of carrito) {
        const tx = db.transaction("productos", "readwrite");
        const prod = await new Promise((resolve, reject) => {
            const req = tx.objectStore("productos").get(item.id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        if (item.tipo === "unidad") prod.stock_unidades -= item.cantidad;
        else prod.stock_kg -= item.peso_kg;
        tx.objectStore("productos").put(prod);
    }
    const totalVenta = carrito.reduce((s,i) => s + i.subtotal, 0);
    // Guardar venta
    const tx = db.transaction("ventas", "readwrite");
    console.log("Guardando venta:", { fecha: new Date().toISOString(), empleado: empleadoActual, total: totalVenta });
    tx.objectStore("ventas").add({
        fecha: new Date().toISOString(),
        empleado: empleadoActual,
        items: JSON.parse(JSON.stringify(carrito)),
        total: totalVenta
    });
    carrito = [];
    actualizarCarrito();
    await cargarProductos();
    alert(`Venta registrada por $${totalVenta.toFixed(2)}`);
}

// Actualizar la barra de turno en esta página
function actualizarTurnoUI() {
    const span = document.getElementById("empleadoActual");
    if (span) span.innerText = localStorage.getItem("empleadoActual") || "Sin iniciar";
}

// Inicializar
window.addEventListener("DOMContentLoaded", async () => {
    await conectarDB();
    actualizarTurnoUI();
    await cargarProductos();
    document.getElementById("btnBuscar").onclick = () => cargarProductos(document.getElementById("buscarProducto").value);
    document.getElementById("confirmarVenta").onclick = confirmarVenta;
    document.getElementById("btnForzarRecarga").onclick = async () => {
        mostrarMensaje("Forzando recarga de productos...", false);
        await cargarProductos();
    };
});
window.actualizarTurnoUI = actualizarTurnoUI;