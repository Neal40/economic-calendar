/* Secrets de l'app (token Notion, jeton TopstepX, clé Claude, config du copier).
 *
 * Windows / Linux : safeStorage d'Electron (comme avant).
 * macOS : l'app est signée « ad-hoc » (pas de compte Apple Developer), donc sa signature change à chaque mise à jour
 * et le trousseau redemandait le mot de passe (« Inner Circle Trader Safe Storage ») à chaque lancement.
 * Ici : une clé AES-256 aléatoire est rangée UNE fois dans le trousseau de session via /usr/bin/security
 * (élément « Inner Circle Trader Secrets », lisible sans fenêtre), et les fichiers sont chiffrés en AES-256-GCM
 * avec cette clé (format « ICT1 » + iv 12 + tag 16 + données). Rien n'est écrit en clair.
 * Les anciens fichiers safeStorage sont relus une dernière fois puis réécrits au nouveau format (une seule demande au trousseau).
 * Ne jamais logguer la clé ni le contenu déchiffré. */
const crypto = require("crypto");

const MAGIC = Buffer.from("ICT1");
const SERVICE = "Inner Circle Trader Secrets", ACCOUNT = "ict";

function make({ safeStorage, platform = process.platform, run } = {}) {
  let key = null, keyErr = false;
  const ss = () => { try { return !!(safeStorage && safeStorage.isEncryptionAvailable()); } catch (e) { return false; } };
  /** clé AES du trousseau macOS (créée au premier besoin) ; null = indisponible → safeStorage */
  function macKey() {
    if (platform !== "darwin" || !run || keyErr) return null;
    if (key) return key;
    try {
      let hex = "";
      try { hex = String(run(["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"]) || "").trim(); } catch (e) { hex = ""; }
      if (!/^[0-9a-f]{64}$/.test(hex)) {
        hex = crypto.randomBytes(32).toString("hex");
        run(["add-generic-password", "-U", "-A", "-s", SERVICE, "-a", ACCOUNT, "-l", SERVICE, "-w", hex]);
        const back = String(run(["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"]) || "").trim();
        if (back !== hex) throw new Error("trousseau");
      }
      key = Buffer.from(hex, "hex"); return key;
    } catch (e) { keyErr = true; return null; }
  }
  function aesEnc(k, s) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", k, iv), d = Buffer.concat([c.update(String(s), "utf8"), c.final()]); return Buffer.concat([MAGIC, iv, c.getAuthTag(), d]); }
  function aesDec(k, b) { const iv = b.subarray(4, 16), tag = b.subarray(16, 32), c = crypto.createDecipheriv("aes-256-gcm", k, iv); c.setAuthTag(tag); return Buffer.concat([c.update(b.subarray(32)), c.final()]).toString("utf8"); }
  const isNew = (b) => b && b.length > 32 && b.subarray(0, 4).equals(MAGIC);
  return {
    /** texte → Buffer chiffré */
    seal(s) { const k = macKey(); if (k) return aesEnc(k, s); return ss() ? safeStorage.encryptString(String(s)) : Buffer.from(String(s), "utf8"); },
    /** Buffer → { s, old } (old = ancien format à réécrire) ; lève une erreur si illisible */
    open(b) {
      if (isNew(b)) { const k = macKey(); if (!k) throw new Error("clé indisponible"); return { s: aesDec(k, b), old: false }; }
      const s = ss() ? safeStorage.decryptString(b) : b.toString("utf8");
      return { s, old: platform === "darwin" && !!macKey() };
    },
    /** macOS : clé du trousseau disponible */
    macReady() { return !!macKey(); },
    _isNew: isNew,
  };
}
module.exports = { make, MAGIC, SERVICE };
