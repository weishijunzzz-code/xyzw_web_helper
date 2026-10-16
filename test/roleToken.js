import { Buffer } from "node:buffer";
import { g_utils } from "../src/utils/bonProtocol.js";

const resBase64 = "ddd=";

const main = async () => {
  const buf = Buffer.from(resBase64, "base64");

  const ress = g_utils.parse(buf);
  console.log("res =", ress);

  const tooo = ress.getData();

  console.log("tooo =", tooo);

  console.log("tooo buf =", tooo.roleToken);
};

main();
