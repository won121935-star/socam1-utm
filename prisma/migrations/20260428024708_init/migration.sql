-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UtmLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT,
    "baseUrl" TEXT NOT NULL,
    "utmSource" TEXT NOT NULL,
    "utmMedium" TEXT NOT NULL,
    "utmCampaign" TEXT NOT NULL,
    "utmTerm" TEXT,
    "utmContent" TEXT,
    "longUrl" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "label" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UtmLink_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Click" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "utmLinkId" TEXT NOT NULL,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "referrer" TEXT,
    "country" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Click_utmLinkId_fkey" FOREIGN KEY ("utmLinkId") REFERENCES "UtmLink" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GaConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountEmail" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "propertyId" TEXT,
    "propertyName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_name_key" ON "Campaign"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UtmLink_shortCode_key" ON "UtmLink"("shortCode");

-- CreateIndex
CREATE INDEX "UtmLink_campaignId_idx" ON "UtmLink"("campaignId");

-- CreateIndex
CREATE INDEX "UtmLink_createdAt_idx" ON "UtmLink"("createdAt");

-- CreateIndex
CREATE INDEX "UtmLink_utmCampaign_idx" ON "UtmLink"("utmCampaign");

-- CreateIndex
CREATE INDEX "UtmLink_utmSource_utmMedium_idx" ON "UtmLink"("utmSource", "utmMedium");

-- CreateIndex
CREATE INDEX "Click_utmLinkId_createdAt_idx" ON "Click"("utmLinkId", "createdAt");
