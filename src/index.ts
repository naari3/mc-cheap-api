import { send, createError, sendError } from "micro";
import { router, get } from "microrouter";

export = router(
    // 直接ボディを返す
    get("/", () => "hello world."),
    // sendメソッドで返す
    get("/hoge", async (_, res) => {
        await send(res, 200, { fuga: true });
    }),
    // エラーレスポンスを返す
    get("/error", async (req, res) => {
        const error = new Error("panic!");
        const httpError = createError(500, "internal server error.", error);

        await sendError(req, res, httpError);
        // これでもいける
        // throw httpError;
    }),
);
