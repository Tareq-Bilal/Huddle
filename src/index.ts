import MyApp from './server.ts';
import env from '../env.ts';

MyApp.listen(env.PORT, () => {
    console.log(`Server is running on port ${env.PORT}`);
});