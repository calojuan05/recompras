-- CreateTable
CREATE TABLE "EnvioVigilado" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "idExterno" TEXT NOT NULL,
    "contactoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "departamento" TEXT NOT NULL,
    "ciudad" TEXT,
    "direccion" TEXT,
    "producto" TEXT,
    "valor" REAL NOT NULL DEFAULT 0,
    "etapa" TEXT NOT NULL,
    "guiaGeneradaAt" DATETIME NOT NULL,
    "entregadoAt" DATETIME,
    "devueltoAt" DATETIME,
    "revisadoAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alertadoAt" DATETIME,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "EnvioVigilado_idExterno_key" ON "EnvioVigilado"("idExterno");

-- CreateIndex
CREATE INDEX "EnvioVigilado_etapa_idx" ON "EnvioVigilado"("etapa");

-- CreateIndex
CREATE INDEX "EnvioVigilado_guiaGeneradaAt_idx" ON "EnvioVigilado"("guiaGeneradaAt");
