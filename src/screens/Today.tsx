const date = new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })

export default function Today() {
  return (
    <div className="hdr">
      <h1>Today</h1>
      <span>{date}.</span>
    </div>
  )
}
