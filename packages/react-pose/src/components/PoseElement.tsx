import * as React from 'react';
import { createContext, createElement } from 'react';
import poseFactory, { Poser, PoserProps } from 'popmotion-pose';
import {
  ChildRegistration,
  CurrentPose,
  PoseContextProps,
  PoseElementProps,
  PopStyle
} from './PoseElement.types';

export const PoseParentContext = createContext({});

const calcPopFromFlowStyle = (el: HTMLElement): PopStyle => {
  const { offsetTop, offsetLeft, offsetWidth, offsetHeight } = el;

  return {
    position: 'absolute',
    top: offsetTop,
    left: offsetLeft,
    width: offsetWidth,
    height: offsetHeight
  };
};

const hasPose = (pose: CurrentPose, key: string) =>
  Array.isArray(pose) ? pose.indexOf(key) !== -1 : pose === key;

const objectToMap = (obj: { [key: string]: any }): Map<string, any> =>
  Object.keys(obj).reduce((map, key) => {
    map.set(key, obj[key]);
    return map;
  }, new Map());

export class PoseElement extends React.PureComponent<PoseElementProps> {
  props: PoseElementProps;
  poser: Poser;
  ref: Element;
  styleProps: { [key: string]: any };
  children: Set<ChildRegistration> = new Set();
  restoreDisplay: string;
  popStyle?: PopStyle;

  /**
   * Children handlers
   * =============================================
   */
  private childrenHandlers: PoseContextProps = {
    registerChild: props => {
      this.children.add(props);
      if (this.poser) this.flushChildren();
    },
    onUnmount: child => this.poser.removeChild(child),
    getParentPoseProps: () => this.props.poseProps,
    getInitialPoseFromParent: () => this.getInitialPose()
  };

  /**
   * Lifecycle
   * =============================================
   */

  getInitialPose(): CurrentPose {
    const { getInitialPoseFromParent, pose, initialPose } = this.props;

    if (initialPose) {
      return initialPose;
    } else {
      // Feel like this could probably be simpler
      const parentPose = getInitialPoseFromParent && getInitialPoseFromParent();
      const thisPose = Array.isArray(pose) ? pose : [pose];

      return Array.isArray(parentPose)
        ? [...parentPose, ...thisPose]
        : [parentPose, ...thisPose];
    }
  }

  getFirstPose(): CurrentPose | void {
    const { pose } = this.props;
    return pose && pose !== this.getInitialPose() ? pose : undefined;
  }

  getSetProps() {
    const {
      children,
      elementType,
      poseProps,
      onChange, // Deprecated for 2.0.0
      onValueChange,
      innerRef,
      pose,
      initialPose,
      onPoseComplete,
      newTree,
      getParentPoseProps,
      registerChild,
      onUnmount,
      getInitialPoseFromParent,
      getPoseFromParent,
      popFromFlow,
      values,
      parentValues,
      ...props
    } = this.props;

    // If we're popping this element out from the DOM flow, build
    // and apply position: absolute styles that visually match the previous
    // location in the DOM
    if (popFromFlow && this.ref && this.ref instanceof HTMLElement) {
      if (!this.popStyle) {
        props.style = {
          ...props.style,
          ...calcPopFromFlowStyle(this.ref)
        };
        this.popStyle = props.style;
      } else {
        props.style = this.popStyle;
      }
    } else {
      this.popStyle = null;
    }

    // Deprecated for 2.0.0
    // If this is a function, it's intended for the DOM element
    if (typeof onChange === 'function') props.onChange = onChange;

    return props;
  }

  setRef = (ref: Element) => {
    const { innerRef } = this.props;
    if (innerRef) innerRef(ref);
    this.ref = ref;
  };

  componentDidMount() {
    if (!this.ref) return;

    const {
      poseProps,
      onChange, // Deprecated 2.0.0
      onValueChange,
      registerChild,
      values,
      parentValues
    } = this.props;
    const props: PoserProps = {
      ...poseProps,
      initialPose: this.getInitialPose(),
      values,
      parentValues: parentValues ? objectToMap(parentValues) : parentValues,
      onChange: onValueChange
        ? onValueChange
        : typeof onChange !== 'function' ? onChange : undefined // 2.0.0 set to just `onValueChange`
    };

    // If first in tree
    if (!registerChild) {
      this.initPoser(poseFactory(this.ref, props));
    } else {
      registerChild({
        element: this.ref,
        poserProps: props,
        onRegistered: poser => this.initPoser(poser)
      });
    }
  }

  UNSAFE_componentWillUpdate({ pose }: PoseElementProps) {
    if (hasPose(pose, 'flip')) this.poser.measure();
  }

  componentDidUpdate(prevProps: PoseElementProps) {
    const { pose } = this.props;
    this.poser.setTransitionProps(this.getSetProps());
    if (pose !== prevProps.pose || pose === 'flip') this.setPose(pose);
  }

  componentWillUnmount() {
    if (!this.poser) return;
    const { onUnmount } = this.props;
    if (onUnmount) onUnmount(this.poser);
    this.poser.destroy();
  }

  initPoser(poser: Poser) {
    this.poser = poser;
    this.poser.setTransitionProps(this.getSetProps());
    this.flushChildren();

    const firstPose = this.getFirstPose();
    if (firstPose) this.setPose(firstPose);
  }

  setPose(pose: CurrentPose) {
    const { onPoseComplete } = this.props;
    const poseList: string[] = Array.isArray(pose) ? pose : [pose];

    Promise.all(poseList.map(key => key && this.poser.set(key))).then(
      () => onPoseComplete && onPoseComplete()
    );
  }

  flushChildren() {
    this.children.forEach(({ element, poserProps, onRegistered }) =>
      onRegistered(this.poser.addChild(element, poserProps))
    );

    this.children.clear();
  }

  render() {
    const { elementType, children } = this.props;
    const props = this.getSetProps();

    return (
      <PoseParentContext.Provider value={this.childrenHandlers}>
        {createElement(
          elementType,
          {
            ...props,
            ref: this.setRef
          },
          children
        )}
      </PoseParentContext.Provider>
    );
  }
}
