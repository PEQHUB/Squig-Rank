import { ErrorLog } from '../src/types';

export default async function handler(req: any, res: any) {
  try {
    const errorsPath = process.cwd() + '/public/errors.json';
    const fs = require('fs');
    let errors: ErrorLog;

    try {
      const data = fs.readFileSync(errorsPath, 'utf-8');
      errors = JSON.parse(data);
    } catch (error) {
      errors = { errors: [], lastUpdated: new Date().toISOString() };
    }

    return res.status(200).json(errors);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
