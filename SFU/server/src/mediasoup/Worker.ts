import * as mediasoup from 'mediasoup';

/**
 * Starts a mediasoup worker process that will host routers.
 * Steps when called:
 * 1. Create a worker with warn-level logs.
 * 2. Log the worker process id.
 * 3. Listen for the died event and log if the process crashes.
 * 4. Return the worker, or log an error if creation fails.
 */
export const createWorker = async() => {
    try {
        const worker = await mediasoup.createWorker({
            logLevel: "warn"
        })

        console.log(`mediasoup worker created ${worker.pid}`);
        worker.on('died', () => {
            console.error("mediasoup Worker died");
        })

        return worker;
    } catch (error: any) {
        console.error(`ERROR on create worker ::: ${error.message}`);
    }
}
