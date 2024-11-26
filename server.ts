import express from "npm:express@4.18.2"
import * as ejs from "npm:ejs"

const app = express()

app.engine(".ejs", ejs.__express)

app.set("views", "views")
app.use(express.static("static"))

app.get("/", (_: express.Request, res: express.Response) => {
  res.render("index.ejs", {
    title: "EJS example",
  })
})

console.log("app listening")
app.listen(8000)
