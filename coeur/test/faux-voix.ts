// regie — faux moteur de voix pour les tests (histoire 4.7) : un WAV de silence, de durée proportionnelle au texte.
// Aucun modèle, aucun processus, aucun appel sortant.
import type { MoteurVoix } from '../src/services/voix.ts';

export const MS_PAR_CARACTERE = 60;

/** WAV PCM 16 bits mono 16 kHz de silence. */
export function wavSilence(dureeMs: number): Buffer {
  const octets = Math.round((dureeMs * 32000) / 1000);
  const b = Buffer.alloc(44 + octets);
  b.write('RIFF', 0, 'latin1');
  b.writeUInt32LE(36 + octets, 4);
  b.write('WAVEfmt ', 8, 'latin1');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'latin1');
  b.writeUInt32LE(octets, 40);
  return b;
}

export class FauxMoteurVoix implements MoteurVoix {
  readonly demandes: string[] = [];
  echec = false;
  sortie: Buffer | undefined;

  async dire(d: Readonly<{ texte: string }>): Promise<Buffer> {
    this.demandes.push(d.texte);
    if (this.echec) throw new Error('PIPER_ECHEC');
    return this.sortie ?? wavSilence(d.texte.length * MS_PAR_CARACTERE);
  }
}
