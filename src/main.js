import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

const targetEl = document.getElementById('app') ?? document.body

const app = mount(App, {
  target: targetEl,
})

export default app