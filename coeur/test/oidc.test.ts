// Histoire 1.14 : le client OIDC face à un faux Authentik local (clés générées, rien ne sort de la machine).
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClientOidc, ErreurOidc, aleatoire, defiPkce, adresseAutorisee } from '../src/infra/oidc.ts';
import { demarrerFauxFournisseur, type FauxFournisseur } from './faux-auth.ts';

describe('client OIDC', () => {
  let faux: FauxFournisseur;
  let client: ClientOidc;
  const nonce = 'nonce-attendu';

  const config = () => ({ emetteur: faux.emetteur, clientId: faux.clientId, clientSecret: faux.clientSecret, urlPublique: 'http://127.0.0.1:4321' });
  const echec = async (promesse: Promise<unknown>, code: string) => {
    const erreur = await promesse.then(() => undefined, (e: unknown) => e);
    expect(erreur).toBeInstanceOf(ErreurOidc);
    expect((erreur as ErreurOidc).code).toBe(code);
    return erreur as ErreurOidc;
  };
  const s = () => Math.floor(Date.now() / 1000);

  beforeAll(async () => {
    faux = await demarrerFauxFournisseur({ finSession: true });
    client = new ClientOidc(config());
  });
  afterAll(async () => {
    await faux.arreter();
  });

  it('découvre le fournisseur et construit une adresse d’autorisation PKCE S256 avec state et nonce', async () => {
    const adresse = new URL(await client.urlAutorisation({ state: 'etat', nonce, challenge: defiPkce('verifieur') }));
    expect(adresse.pathname).toBe('/application/o/authorize/');
    expect(Object.fromEntries(adresse.searchParams)).toMatchObject({
      response_type: 'code',
      client_id: faux.clientId,
      redirect_uri: 'http://127.0.0.1:4321/connexion/retour',
      scope: 'openid profile email',
      state: 'etat',
      nonce,
      code_challenge: createHash('sha256').update('verifieur').digest('base64url'),
      code_challenge_method: 'S256',
    });
    expect(adresse.searchParams.has('max_age')).toBe(false);
  });

  it('demande max_age et prompt=login pour une authentification récente', async () => {
    const adresse = new URL(await client.urlAutorisation({ state: 'a', nonce, challenge: 'c', maxAge: 600 }));
    expect(adresse.searchParams.get('max_age')).toBe('600');
    expect(adresse.searchParams.get('prompt')).toBe('login');
  });

  it('annonce la fin de session d’Authentik', async () => {
    expect(await client.urlFinSession()).toBe(faux.finSession);
  });

  it('échange le code avec le secret en Basic et le vérificateur PKCE', async () => {
    const verifieur = aleatoire();
    faux.poserCode('code-ok', faux.jetonValide(nonce), defiPkce(verifieur));
    expect(await client.echangerCode('code-ok', verifieur)).toMatch(/^eyJ/);
  });

  it('refuse l’échange avec un mauvais vérificateur PKCE ou un code inconnu', async () => {
    faux.poserCode('code-pkce', faux.jetonValide(nonce), defiPkce('le-bon'));
    await echec(client.echangerCode('code-pkce', 'le-mauvais'), 'echange');
    await echec(client.echangerCode('code-inconnu', 'x'), 'echange');
  });

  it('refuse l’échange avec un mauvais secret de client', async () => {
    const autre = new ClientOidc({ ...config(), clientSecret: 'faux-secret' });
    faux.poserCode('code-secret', faux.jetonValide(nonce), defiPkce('v'));
    await echec(autre.echangerCode('code-secret', 'v'), 'echange');
  });

  describe('vérification de l’id_token', () => {
    it.each(['RS256', 'ES256'] as const)('accepte un jeton %s conforme', async (alg) => {
      const claims = await client.verifierJeton(faux.jetonValide(nonce, {}, { alg }), { nonce });
      expect(claims).toMatchObject({ sub: 'sub-benjamin', email: 'benjamin@exemple.test', emailVerifie: true });
    });

    it('refuse un mauvais nonce', async () => {
      await echec(client.verifierJeton(faux.jetonValide('autre-nonce'), { nonce }), 'nonce');
      await echec(client.verifierJeton(faux.jetonValide(nonce, { nonce: undefined }), { nonce }), 'nonce');
    });

    it('refuse un mauvais émetteur et une mauvaise audience', async () => {
      await echec(client.verifierJeton(faux.jetonValide(nonce, { iss: 'https://autre.example/' }), { nonce }), 'emetteur');
      await echec(client.verifierJeton(faux.jetonValide(nonce, { aud: 'autre-client' }), { nonce }), 'audience');
      await echec(client.verifierJeton(faux.jetonValide(nonce, { aud: [faux.clientId, 'autre'] }), { nonce }), 'audience');
    });

    it('refuse un jeton expiré ou émis dans le futur (tolérance de 60 s)', async () => {
      await echec(client.verifierJeton(faux.jetonValide(nonce, { iat: s() - 1000, exp: s() - 200 }), { nonce }), 'expire');
      await echec(client.verifierJeton(faux.jetonValide(nonce, { iat: s() + 1000, exp: s() + 2000 }), { nonce }), 'expire');
      await client.verifierJeton(faux.jetonValide(nonce, { iat: s() - 400, exp: s() - 30 }), { nonce });
    });

    it('refuse alg none, HS256 signé avec la clé publique, et tout autre algorithme', async () => {
      await echec(client.verifierJeton(faux.jetonValide(nonce, {}, { alg: 'none' }), { nonce }), 'jeton_invalide');
      await echec(client.verifierJeton(faux.jetonValide(nonce, {}, { alg: 'HS256' }), { nonce }), 'signature');
    });

    it('refuse une signature altérée, une autre clé, un kid inconnu', async () => {
      const jeton = faux.jetonValide(nonce);
      const [e, c, sig] = jeton.split('.') as [string, string, string];
      const charge = Buffer.from(c, 'base64url').toString().replace('sub-benjamin', 'sub-pirate');
      await echec(client.verifierJeton(`${e}.${Buffer.from(charge).toString('base64url')}.${sig}`, { nonce }), 'signature');
      const s2 = s();
      const autreCle = faux.signer({ iss: faux.emetteur, aud: faux.clientId, sub: 'x', iat: s2, exp: s2 + 60, nonce }, { cle: faux.cleRsaAutre });
      await echec(client.verifierJeton(autreCle, { nonce }), 'signature');
      await echec(client.verifierJeton(faux.jetonValide(nonce, {}, { kid: 'inconnu' }), { nonce }), 'signature');
    });

    it('refuse un jeton mal formé', async () => {
      for (const jeton of ['', 'a.b', 'a.b.c.d', '..', 'eyJ.eyJ.%%%']) {
        await echec(client.verifierJeton(jeton, { nonce }), 'jeton_invalide');
      }
    });

    it('vérifie auth_time quand max_age est demandé', async () => {
      const recent = faux.jetonValide(nonce, { auth_time: s() - 30 });
      expect((await client.verifierJeton(recent, { nonce, maxAge: 600 })).authTime).toBeLessThanOrEqual(s());
      await echec(client.verifierJeton(faux.jetonValide(nonce, { auth_time: s() - 3600 }), { nonce, maxAge: 600 }), 'auth_trop_ancienne');
      await echec(client.verifierJeton(faux.jetonValide(nonce, { auth_time: undefined }), { nonce, maxAge: 600 }), 'auth_trop_ancienne');
    });

    it('ne contient aucun jeton dans ses messages d’erreur', async () => {
      const jeton = faux.jetonValide('autre');
      const erreur = await echec(client.verifierJeton(jeton, { nonce }), 'nonce');
      expect(erreur.message).not.toContain(jeton.slice(10, 40));
    });
  });

  it('refuse une découverte qui annonce un autre émetteur, et les adresses http non locales', async () => {
    await echec(new ClientOidc({ ...config(), emetteur: `${faux.emetteur.replace('/regie/', '/regie')}` }).metadonnees(), 'emetteur');
    expect(() => new ClientOidc({ ...config(), emetteur: 'http://authentik.example/' })).toThrow(ErreurOidc);
    expect(adresseAutorisee('https://auth.etablia.fr/')).toBe(true);
    expect(adresseAutorisee('http://localhost:9000/')).toBe(true);
    expect(adresseAutorisee('http://auth.etablia.fr/')).toBe(false);
    expect(adresseAutorisee('javascript:alert(1)')).toBe(false);
  });

  it('signale Authentik injoignable', async () => {
    const injoignable = new ClientOidc({ ...config(), emetteur: 'http://127.0.0.1:1/application/o/regie/' });
    await echec(injoignable.metadonnees(), 'decouverte');
  });

  it('recharge les clés une fois quand un kid est inconnu, puis refuse', async () => {
    const avant = faux.appels.filter((a) => a.chemin.endsWith('/jwks/')).length;
    const neuf = new ClientOidc(config());
    await echec(neuf.verifierJeton(faux.jetonValide(nonce, {}, { kid: 'inconnu' }), { nonce }), 'signature');
    const apres = faux.appels.filter((a) => a.chemin.endsWith('/jwks/')).length;
    expect(apres - avant).toBe(1);
  });
});
