function sendContract(res, { status = 200, parser, body }) {
  const payload = parser ? parser(body) : body;
  res.status(status).json(payload);
}

function sendError(res, status, code, error) {
  res.status(status).json({ code, error });
}

module.exports = { sendContract, sendError };
