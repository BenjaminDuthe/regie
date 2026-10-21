// regie — écrit docs/api/reference.md depuis le registre (histoire 1.11). Usage : npm run api:reference -w coeur
import { writeFileSync } from 'node:fs';
import { ACTIONS } from '../src/services/actions.ts';
import { EXCEPTIONS_PARITE } from '../src/services/exceptions-parite.ts';
import { genererReference } from '../src/services/reference.ts';

writeFileSync(new URL('../../docs/api/reference.md', import.meta.url), genererReference(ACTIONS, EXCEPTIONS_PARITE));
