declare module 'express' {
    export interface Request {
        user: { id: string | number };
    }

    export interface Response {
        json(body: any): this;
        status(code: number): this;
    }

    export function Router(): any;
}

import { Router, type Request, type Response } from 'express';
import { computeScores } from '../utils/scoringService';
import { DEFAULT_CONFIG } from '../utils/estimateService';
import * as db from '../utils/db';

const router = Router();

router.get("/", async (req: Request, res: Response) => {
    try {
        const assignments = await db.getAssignments();
        const config = (await db.getUserConfig(req.user.id)) ?? DEFAULT_CONFIG;
    res.json(computeScores(assignments, config));
    } catch (error) {
        console.error(error);
        res.status(500).json({error: "Failed to compute scores"});
}
});

export default router;
