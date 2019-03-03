import './console-frame.scss';
import { createStore, applyMiddleware } from 'redux';
import promise from 'redux-promise';
import reducers from 'content/reducers';
import TopContentComponent from './components/top-content';
import FrameContentComponent from './components/frame-content';
import SettingController from './controllers/SettingController';

new SettingController(); // eslint-disable-line no-new

const store = createStore(
  reducers,
  applyMiddleware(promise),
);

if (window.self === window.top) {
  new TopContentComponent(window, store); // eslint-disable-line no-new
} else {
  new FrameContentComponent(window, store); // eslint-disable-line no-new
}
