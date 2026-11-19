-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" TEXT,
    "nombreCompleto" TEXT NOT NULL,
    "email" TEXT,
    "telefono" TEXT,
    "ciudad" TEXT,
    "canalPreferido" TEXT NOT NULL DEFAULT 'whatsapp',
    "consentimientoMarketing" BOOLEAN NOT NULL DEFAULT false,
    "fechaAlta" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaInteraccionAt" DATETIME,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "origen" TEXT NOT NULL DEFAULT 'manual',
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "sku" TEXT,
    "presentacion" TEXT NOT NULL DEFAULT '',
    "unidadMedida" TEXT NOT NULL DEFAULT 'capsulas',
    "unidadesPorFrasco" REAL NOT NULL,
    "dosisDiariaSugerida" REAL NOT NULL,
    "duracionEstimadaDias" INTEGER NOT NULL,
    "diasDeAnticipacion" INTEGER,
    "precio" REAL NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProductAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "patron" TEXT NOT NULL,
    CONSTRAINT "ProductAlias_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PriceScale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "valor" INTEGER NOT NULL,
    "unidades" INTEGER NOT NULL,
    CONSTRAINT "PriceScale_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" TEXT,
    "customerId" TEXT NOT NULL,
    "productId" TEXT,
    "cantidadFrascos" INTEGER NOT NULL DEFAULT 1,
    "fechaCompra" DATETIME NOT NULL,
    "fechaPedido" DATETIME,
    "canalVenta" TEXT NOT NULL DEFAULT 'whatsapp',
    "precioUnitario" REAL NOT NULL DEFAULT 0,
    "valorTotal" REAL NOT NULL DEFAULT 0,
    "origen" TEXT NOT NULL DEFAULT 'manual',
    "estadoEntrega" TEXT NOT NULL DEFAULT 'entregado',
    "tituloCrudo" TEXT,
    "requiereRevision" BOOLEAN NOT NULL DEFAULT false,
    "motivoRevision" TEXT,
    "claveNatural" TEXT NOT NULL,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" DATETIME NOT NULL,
    CONSTRAINT "Purchase_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Purchase_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConsumptionProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "dosisDiariaReal" REAL,
    "factorAjuste" REAL NOT NULL DEFAULT 1.0,
    "notas" TEXT,
    "actualizadoEn" DATETIME NOT NULL,
    CONSTRAINT "ConsumptionProfile_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConsumptionProfile_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RepurchaseCycle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "fechaInicio" DATETIME NOT NULL,
    "fechaAgotamientoEstimada" DATETIME NOT NULL,
    "fechaRecompraSugerida" DATETIME NOT NULL,
    "diasDeAnticipacion" INTEGER NOT NULL DEFAULT 7,
    "estado" TEXT NOT NULL DEFAULT 'PROGRAMADO',
    "intentosContacto" INTEGER NOT NULL DEFAULT 0,
    "ultimoContactoAt" DATETIME,
    "convertidoAt" DATETIME,
    "factorAjusteAplicado" REAL NOT NULL DEFAULT 1.0,
    "notas" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" DATETIME NOT NULL,
    CONSTRAINT "RepurchaseCycle_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RepurchaseCycle_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RepurchaseCycle_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationOutbox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cycleId" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "plantilla" TEXT NOT NULL,
    "destinatario" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "programadoPara" DATETIME NOT NULL,
    "enviadoAt" DATETIME,
    "error" TEXT,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationOutbox_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "RepurchaseCycle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "canal" TEXT NOT NULL DEFAULT 'whatsapp',
    "asunto" TEXT,
    "cuerpo" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "actualizadoEn" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "payloadAntes" TEXT,
    "payloadDespues" TEXT,
    "actor" TEXT NOT NULL DEFAULT 'sistema',
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Setting" (
    "clave" TEXT NOT NULL PRIMARY KEY,
    "valor" TEXT NOT NULL,
    "actualizadoEn" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_externalId_key" ON "Customer"("externalId");

-- CreateIndex
CREATE INDEX "Customer_nombreCompleto_idx" ON "Customer"("nombreCompleto");

-- CreateIndex
CREATE INDEX "Customer_activo_idx" ON "Customer"("activo");

-- CreateIndex
CREATE UNIQUE INDEX "Product_nombre_key" ON "Product"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAlias_patron_key" ON "ProductAlias"("patron");

-- CreateIndex
CREATE INDEX "ProductAlias_productId_idx" ON "ProductAlias"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceScale_productId_valor_key" ON "PriceScale"("productId", "valor");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_externalId_key" ON "Purchase"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_claveNatural_key" ON "Purchase"("claveNatural");

-- CreateIndex
CREATE INDEX "Purchase_customerId_idx" ON "Purchase"("customerId");

-- CreateIndex
CREATE INDEX "Purchase_productId_idx" ON "Purchase"("productId");

-- CreateIndex
CREATE INDEX "Purchase_fechaCompra_idx" ON "Purchase"("fechaCompra");

-- CreateIndex
CREATE UNIQUE INDEX "ConsumptionProfile_customerId_productId_key" ON "ConsumptionProfile"("customerId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "RepurchaseCycle_purchaseId_key" ON "RepurchaseCycle"("purchaseId");

-- CreateIndex
CREATE INDEX "RepurchaseCycle_estado_idx" ON "RepurchaseCycle"("estado");

-- CreateIndex
CREATE INDEX "RepurchaseCycle_fechaRecompraSugerida_idx" ON "RepurchaseCycle"("fechaRecompraSugerida");

-- CreateIndex
CREATE INDEX "RepurchaseCycle_customerId_idx" ON "RepurchaseCycle"("customerId");

-- CreateIndex
CREATE INDEX "NotificationOutbox_estado_idx" ON "NotificationOutbox"("estado");

-- CreateIndex
CREATE INDEX "NotificationOutbox_cycleId_idx" ON "NotificationOutbox"("cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_nombre_key" ON "MessageTemplate"("nombre");

-- CreateIndex
CREATE INDEX "AuditLog_entidad_entidadId_idx" ON "AuditLog"("entidad", "entidadId");

-- CreateIndex
CREATE INDEX "AuditLog_creadoEn_idx" ON "AuditLog"("creadoEn");
