import { describe, expect, it } from 'vitest';
import { construireAss, construirePlanRendu, evaluerImagesCle, expressionImagesCle, texteAss, type ParametresTexte } from '../src/rendu.ts';
import { CUE_MAX_CARACTERES, decouperPhrases, sousTitres, tempsSrt, versSrt } from '../src/sous-titres.ts';
import { depuisJournal, imagesCle, type EntreeJournalMontage } from '../src/timeline.ts';

const journal: EntreeJournalMontage[] = [
  { t: 0, genre: 'film_debut' },
  { t: 100, genre: 'narration', cible: 'Bienvenue sur la page. Voici le tableau de bord, avec ses indicateurs principaux et ses filtres.' },
  { t: 2000, genre: 'clic', x: 800, y: 200 },
  { t: 4000, genre: 'narration', cible: 'Un deuxième temps.' },
  { t: 6000, genre: 'clic', x: 200, y: 900 },
  { t: 9000, genre: 'film_fin' },
];
const p: ParametresTexte = {
  couleurTexte: '#FFFFFF', couleurFond: '#111111', couleurPrincipale: '#1A73E8', couleurAccent: '#F4B400',
  policeTitres: 'Montserrat', policeSousTitres: 'Inter', tailleTitre: 72, tailleSousTitres: 60, capitalesSousTitres: false,
  zone: { x: 60, y: 200, largeur: 960, hauteur: 1400 },
};
const t = depuisJournal(journal, { filmDureeMs: 9500, titre: 'Ma démo', carteFin: { titre: 'Essayez', sousTitre: 'regie.fr' } });

describe('sous-titres', () => {
  it('coupe en phrases courtes', () => {
    for (const ph of decouperPhrases('Une phrase très longue, qui n’en finit pas, avec beaucoup de mots pour dépasser la limite de caractères.')) expect(ph.length).toBeLessThanOrEqual(CUE_MAX_CARACTERES);
    expect(decouperPhrases('   ')).toEqual([]);
  });
  it('reste dans la scène et ne se chevauche pas', () => {
    const cues = sousTitres(t);
    expect(cues.length).toBeGreaterThan(1);
    for (let i = 0; i < cues.length; i++) {
      expect(cues[i]!.finMs).toBeGreaterThan(cues[i]!.debutMs);
      if (i > 0) expect(cues[i]!.debutMs).toBeGreaterThanOrEqual(cues[i - 1]!.finMs);
    }
  });
  it('écrit un SRT bien formé', () => {
    expect(tempsSrt(3_723_004)).toBe('01:02:03,004');
    const srt = versSrt(sousTitres(t));
    expect(srt.startsWith('1\n00:00:00,')).toBe(true);
    expect(srt).toContain(' --> ');
  });
});

describe('rendu : expressions et plan', () => {
  it('les expressions suivent les mêmes images clés que le cadre calculé', () => {
    const cles = imagesCle(t.scenes[0]!);
    expect(expressionImagesCle(cles, 'z', 'in_time')).toContain('gte(in_time,');
    expect(evaluerImagesCle(cles, 'z', 0)).toBeGreaterThanOrEqual(1);
    expect(evaluerImagesCle(cles, 'z', 10 ** 9)).toBe(cles.at(-1)!.z);
  });
  it('est déterministe et ne met aucun texte dans les arguments', () => {
    const a = construirePlanRendu(t, p, { genre: 'complet' });
    const b = construirePlanRendu(t, p, { genre: 'complet' });
    expect(a).toEqual(b);
    const tout = a.args.join(' ');
    expect(tout).not.toContain('Bienvenue');
    expect(tout).not.toContain('Ma démo');
    expect(a.graphe).not.toContain('Bienvenue');
    expect(a.args).toContain('-/filter_complex');
    expect(a.args).toContain('-an');
    expect(a.args).toContain('-map_metadata');
  });
  it('allégé : demi-résolution, débit borné ; vaapi : init du périphérique', () => {
    const al = construirePlanRendu(t, p, { genre: 'allege' });
    expect(al.graphe).toContain('scale=540:960');
    expect(al.args).toContain('-maxrate');
    const va = construirePlanRendu(t, p, { genre: 'allege', encodeur: 'h264_vaapi' });
    expect(va.args).toContain('-init_hw_device');
    expect(va.graphe).toContain('hwupload');
    expect(construirePlanRendu(t, p, { genre: 'complet' }).args).not.toContain('-init_hw_device');
  });
  it('sans texte demandé, pas de filtre ass', () => {
    expect(construirePlanRendu(t, p, { genre: 'complet', avecTexte: false }).graphe).not.toContain('ass=');
    expect(construirePlanRendu(t, p, { genre: 'complet' }).graphe).toContain('ass=');
  });
  it('voix : une entrée par scène donnée, ignore les identifiants inconnus', () => {
    const id = t.scenes[1]!.id;
    const plan = construirePlanRendu(t, p, { genre: 'complet', voix: [id, 'inconnue'] });
    expect(plan.fichiersVoix).toEqual([`voix-${id}.wav`]);
    expect(plan.args).toContain('aac');
    expect(plan.graphe).toContain('adelay=');
  });
  it('refuse une couleur invalide', () => {
    expect(() => construirePlanRendu(t, { ...p, couleurTexte: 'rouge' }, { genre: 'complet' })).toThrow();
  });
});

describe('rendu : ASS', () => {
  it('neutralise les balises, les retours et les caractères de contrôle d’un texte', () => {
    const s = texteAss('{\\an9\\pos(0,0)}Bonjour\nmonde\u0000}');
    expect(s).not.toMatch(/[{}\\]/);
    expect(s).not.toContain('\n');
    const piege = { ...t, scenes: t.scenes.map((x, i) => (i === 0 ? { ...x, texteEcran: '{\\fs999}Piège\nDialogue: 0,0:00:00.00' } : x)) };
    const ass = construireAss(piege, p);
    expect(ass).not.toContain('\\fs999');
    expect(ass.split('\n').filter((l) => l.startsWith('Dialogue:') && l.includes('Piège')).length).toBe(1);
  });
  it('porte la résolution de la toile, les sous-titres et la carte de fin', () => {
    const ass = construireAss(t, p);
    expect(ass).toContain('PlayResX: 1080');
    expect(ass).toContain('PlayResY: 1920');
    expect(ass).toMatch(/Dialogue: 0,[^,]+,[^,]+,SousTitre/);
    expect(ass).toMatch(/,Carte,/);
    expect(construireAss(t, p, false)).not.toMatch(/,SousTitre,,/);
  });
  it('met les sous-titres en capitales si le style le demande', () => {
    expect(construireAss(t, { ...p, capitalesSousTitres: true })).toContain('BIENVENUE SUR LA PAGE.');
  });
});
