// Histoire 9.2 : âge des sauvegardes dans /sante, mode restauration, scripts de sauvegarde (avec de faux pg_dump, age, vzdump et pct :
// rien n'est exécuté contre une vraie machine).
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lireEnvironnement } from '../src/env.ts';
import { calculerSante, lireSauvegarde } from '../src/infra/sante.ts';
import { FONCTIONS_PAR_MODE } from '../src/infra/mode.ts';

const SCRIPT = fileURLToPath(new URL('../../deploiement/sauvegarde/sauvegarde.sh', import.meta.url));
const MAINTENANT = Date.parse('2026-10-21T12:00:00Z');
const il_y_a = (heures: number) => new Date(MAINTENANT - heures * 3_600_000).toISOString().replace(/\.\d{3}Z$/, 'Z');

let racine: string;
beforeAll(() => {
  racine = mkdtempSync(join(tmpdir(), 'regie-sauvegarde-'));
});
afterAll(() => rmSync(racine, { recursive: true, force: true }));

const dossierEtat = (base?: string, vzdump?: string): string => {
  const d = mkdtempSync(join(racine, 'etat-'));
  if (base !== undefined) writeFileSync(join(d, 'base_le'), `${base}\n`);
  if (vzdump !== undefined) writeFileSync(join(d, 'vzdump_le'), `${vzdump}\n`);
  return d;
};

describe('âge des sauvegardes (NFR-41)', () => {
  it('récent : ok avec l’âge en heures ; au-delà de 36 h (dump) ou 9 jours (vzdump) : ancienne', async () => {
    expect(await lireSauvegarde(dossierEtat(il_y_a(3), il_y_a(24 * 3)), MAINTENANT)).toEqual({ base: { etat: 'ok', age_heures: 3 }, vzdump: { etat: 'ok', age_heures: 72 } });
    const vieux = await lireSauvegarde(dossierEtat(il_y_a(37), il_y_a(24 * 10)), MAINTENANT);
    expect(vieux.base.etat).toBe('ancienne');
    expect(vieux.vzdump.etat).toBe('ancienne');
  });

  it('absente ou illisible n’est jamais ok', async () => {
    expect(await lireSauvegarde(join(racine, 'nexiste-pas'), MAINTENANT)).toEqual({ base: { etat: 'absente', age_heures: null }, vzdump: { etat: 'absente', age_heures: null } });
    const faux = await lireSauvegarde(dossierEtat('hier soir', '2026-10-21'), MAINTENANT);
    expect(faux.base).toEqual({ etat: 'illisible', age_heures: null });
    expect(faux.vzdump).toEqual({ etat: 'illisible', age_heures: null });
  });

  it('/sante ne cite ni chemin ni machine, et se dégrade quand une sauvegarde est ancienne', async () => {
    const bonne = await calculerSante(undefined, '/', { dossierSauvegarde: dossierEtat(il_y_a(1), il_y_a(1)), maintenant: MAINTENANT });
    expect(Object.keys(bonne.sauvegarde!).sort()).toEqual(['base', 'vzdump']);
    expect(JSON.stringify(bonne)).not.toMatch(/regie-sauvegarde|pve-|\/tmp|\/var/);
    const sans = await calculerSante(undefined, '/');
    expect(sans.sauvegarde).toBeUndefined();
    expect(sans.mode).toBe('normal');
  });
});

describe('/sante dégradée par une sauvegarde ancienne (base simulée par un pool factice)', () => {
  const sources = (() => {
    const pool = { query: async () => ({ rows: [] }) };
    return { pool, coffre: undefined } as never;
  })();
  it('l’état global reste dégradé tant que la base ne répond pas correctement ; la sauvegarde ancienne le dégrade aussi', async () => {
    const s = await calculerSante(sources, '/', { dossierSauvegarde: dossierEtat(il_y_a(50), il_y_a(1)), maintenant: MAINTENANT });
    expect(s.etat).toBe('degrade');
    expect(s.sauvegarde!.base.etat).toBe('ancienne');
  });
  it('en mode restauration, l’âge de la sauvegarde ne dégrade pas', async () => {
    const s = await calculerSante(undefined, '/', { mode: 'restauration', dossierSauvegarde: dossierEtat(il_y_a(500), il_y_a(500)), maintenant: MAINTENANT });
    expect(s.mode).toBe('restauration');
  });
});

describe('mode restauration', () => {
  it('REGIE_MODE vaut normal par défaut ; restauration est reconnu ; toute autre valeur est refusée', () => {
    expect(lireEnvironnement({}).REGIE_MODE).toBe('normal');
    expect(lireEnvironnement({ REGIE_MODE: 'restauration' }).REGIE_MODE).toBe('restauration');
    expect(() => lireEnvironnement({ REGIE_MODE: 'autre' })).toThrow(/REGIE_MODE/);
  });
  it('en restauration : ni file, ni planificateur, ni connecteur de réseau ; en normal : tout tourne', () => {
    expect(FONCTIONS_PAR_MODE.restauration).toEqual({ file: false, planificateur: false, publications: false });
    expect(FONCTIONS_PAR_MODE.normal).toEqual({ file: true, planificateur: true, publications: true });
  });
});

/** Faux binaires : ils écrivent leurs arguments dans un journal, ne touchent à rien d'autre. */
function banc() {
  const d = mkdtempSync(join(racine, 'banc-'));
  const bin = join(d, 'bin');
  mkdirSync(bin);
  const journal = join(d, 'appels.log');
  const faux = (nom: string, corps: string) => {
    writeFileSync(join(bin, nom), `#!/usr/bin/env bash\necho "${nom} $*" >> "${journal}"\n${corps}\n`);
    chmodSync(join(bin, nom), 0o755);
  };
  faux('pg_dump', 'echo "CONTENU-DU-DUMP"');
  // age : chiffrer = copier stdin dans --output en le préfixant ; déchiffrer = retirer le préfixe.
  faux('age', 'sortie=""; dechiffrer=0; entree=""; while [ $# -gt 0 ]; do case "$1" in --output) sortie="$2"; shift;; --decrypt) dechiffrer=1;; --identity|--recipients-file) shift;; *) entree="$1";; esac; shift; done\nif [ $dechiffrer = 1 ]; then tail -n +2 "$entree"; else { echo "AGE-CHIFFRE"; cat; } > "$sortie"; fi');
  faux('pg_restore', 'cat > /dev/null');
  faux('vzdump', 'true');
  faux('pct', 'case "$1" in push) cp "$3" "$4_pousse_$(basename "$4")" 2>/dev/null || true;; esac');
  const lancer = (args: string[], env: Record<string, string>) =>
    spawnSync('bash', [SCRIPT, ...args], { env: { PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`, HOME: d, ...env }, encoding: 'utf8' });
  return { d, journal, lancer, appels: () => (existsSync(journal) ? readFileSync(journal, 'utf8') : '') };
}

describe('sauvegarde.sh', () => {
  it('base : dump chiffré, copié, daté ; le dump ne sort jamais en clair', () => {
    const b = banc();
    const destinataires = join(b.d, 'destinataires.txt');
    writeFileSync(destinataires, 'age1clepubliquededemonstration\n');
    const env = { REGIE_SAUVEGARDE_ETAT: join(b.d, 'etat'), SAUVEGARDE_LOCAL: join(b.d, 'local'), SAUVEGARDE_DESTINATION: join(b.d, 'distant'), AGE_DESTINATAIRES: destinataires };
    const r = b.lancer(['base'], env);
    expect(r.status, r.stderr).toBe(0);
    const copies = readdirSync(join(b.d, 'distant'));
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatch(/^regie-base-\d{8}T\d{6}Z\.dump\.age$/);
    const contenu = readFileSync(join(b.d, 'distant', copies[0]!), 'utf8');
    expect(contenu.startsWith('AGE-CHIFFRE')).toBe(true);
    expect(readdirSync(join(b.d, 'local')).every((n) => n.endsWith('.age'))).toBe(true);
    expect(readFileSync(join(b.d, 'etat', 'base_le'), 'utf8').trim()).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    expect(b.appels()).toContain('--recipients-file');
  });

  it('base : sans destinataire age ou sans destination, rien n’est produit ni daté', () => {
    const b = banc();
    const env = { REGIE_SAUVEGARDE_ETAT: join(b.d, 'etat'), SAUVEGARDE_LOCAL: join(b.d, 'local'), SAUVEGARDE_DESTINATION: join(b.d, 'distant') };
    expect(b.lancer(['base'], { ...env, AGE_DESTINATAIRES: join(b.d, 'absent.txt') }).status).not.toBe(0);
    expect(b.lancer(['base'], { REGIE_SAUVEGARDE_ETAT: env.REGIE_SAUVEGARDE_ETAT }).status).not.toBe(0);
    expect(existsSync(join(b.d, 'etat', 'base_le'))).toBe(false);
    expect(b.appels()).not.toContain('pg_dump');
  });

  it('base : un dump qui échoue ne laisse aucune date', () => {
    const b = banc();
    writeFileSync(join(b.d, 'bin', 'pg_dump'), '#!/usr/bin/env bash\nexit 3\n');
    const destinataires = join(b.d, 'destinataires.txt');
    writeFileSync(destinataires, 'age1x\n');
    const r = b.lancer(['base'], { REGIE_SAUVEGARDE_ETAT: join(b.d, 'etat'), SAUVEGARDE_LOCAL: join(b.d, 'local'), SAUVEGARDE_DESTINATION: join(b.d, 'distant'), AGE_DESTINATAIRES: destinataires });
    expect(r.status).not.toBe(0);
    expect(existsSync(join(b.d, 'etat', 'base_le'))).toBe(false);
    expect(existsSync(join(b.d, 'distant'))).toBe(false);
  });

  it('vzdump : exclut les emplacements de secrets (la clé maîtresse n’y figure pas) et retombe sur ces exclusions si la liste est vide', () => {
    const b = banc();
    const r = b.lancer(['vzdump'], { CTID: '140', STOCKAGE_VZDUMP: 'sauvegarde-distante', DOSSIER_ETAT_CT: join(b.d, 'ct-etat') });
    expect(r.status, r.stderr).toBe(0);
    const appel = b.appels().split('\n').find((l) => l.startsWith('vzdump'))!;
    expect(appel).toContain('--exclude-path /home/regie/.local/share/containers/storage/secrets');
    expect(appel).toContain('--exclude-path /run/secrets');
    expect(appel).toContain('--storage sauvegarde-distante');
    // Une liste vide retombe sur les emplacements par défaut : on ne peut pas, même par oubli, sauvegarder sans exclure les secrets.
    expect(b.lancer(['vzdump'], { CTID: '140', STOCKAGE_VZDUMP: 'x', CHEMINS_SECRETS_EXCLUS: '' }).status).toBe(0);
    expect(b.appels().split('\n').filter((l) => l.startsWith('vzdump')).every((l) => l.includes('--exclude-path /run/secrets'))).toBe(true);
  });

  it('vzdump : un vzdump qui échoue ne pose pas la date dans le CT', () => {
    const b = banc();
    writeFileSync(join(b.d, 'bin', 'vzdump'), '#!/usr/bin/env bash\nexit 1\n');
    const r = b.lancer(['vzdump'], { CTID: '140', STOCKAGE_VZDUMP: 'x' });
    expect(r.status).not.toBe(0);
    expect(b.appels()).not.toContain('pct push');
  });

  it('restaurer-base et lister : exigent la clé privée posée à la main ; sans elle, rien ne se rejoue', () => {
    const b = banc();
    const dump = join(b.d, 'regie-base-x.dump.age');
    writeFileSync(dump, 'AGE-CHIFFRE\nCONTENU\n');
    expect(b.lancer(['restaurer-base', dump], { PGDATABASE: 'regie' }).status).not.toBe(0);
    expect(b.appels()).not.toContain('pg_restore');
    const identite = join(b.d, 'identite.txt');
    writeFileSync(identite, 'AGE-SECRET-KEY-DE-TEST\n');
    expect(b.lancer(['lister', dump], { AGE_IDENTITE: identite }).status).toBe(0);
    const r = b.lancer(['restaurer-base', dump], { AGE_IDENTITE: identite, PGDATABASE: 'regie' });
    expect(r.status, r.stderr).toBe(0);
    expect(b.appels()).toContain('pg_restore --no-owner --no-privileges --exit-on-error --dbname regie');
  });

  it('le script ne contient aucun secret ni nom de machine exposée', () => {
    const texte = readFileSync(SCRIPT, 'utf8');
    expect(texte).not.toMatch(/AGE-SECRET-KEY-1|age1[a-z0-9]{50,}|password\s*=|PGPASSWORD=/i);
  });
});
