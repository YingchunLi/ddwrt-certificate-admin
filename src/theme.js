export const shadeColor = function(color, percent) {
    let f=parseInt(color.slice(1),16),t=percent<0?0:255,p=percent<0?percent*-1:percent,R=f>>16,G=(f>>8)&0x00FF,B=f&0x0000FF;
    return "#"+(0x1000000+(Math.round((t-R)*p)+R)*0x10000+(Math.round((t-G)*p)+G)*0x100+(Math.round((t-B)*p)+B)).toString(16).slice(1);
};

export const PRIMARY_TEXT = '#434a54';

export const PRIMARY_COLOR = '#4a89dc';
export const PRIMARY_COLOR_CONTRAST = '#f1f5fc';

export const PRIMARY_COLOR_DARKER = shadeColor(PRIMARY_COLOR, -0.2);
export const PRIMARY_COLOR_DARKEST = shadeColor(PRIMARY_COLOR, -0.4);

export const PRIMARY_COLOR_LIGHTER = shadeColor(PRIMARY_COLOR, 0.1);
export const PRIMARY_COLOR_LIGHTEST = shadeColor(PRIMARY_COLOR, 0.2);

export const SECONDARY_COLOR = '#3bbe9e';
export const SECONDARY_COLOR_CONTRAST = '#f1f5fc';

export const SECONDARY_COLOR_DARKER = shadeColor(SECONDARY_COLOR, -0.2);
export const SECONDARY_COLOR_DARKEST = shadeColor(SECONDARY_COLOR, -0.4);

export const SECONDARY_COLOR_LIGHTER = shadeColor(SECONDARY_COLOR, 0.1);
export const SECONDARY_COLOR_LIGHTEST = shadeColor(SECONDARY_COLOR, 0.2);

export const INFO_COLOR = '#4a89dc';
export const INFO_COLOR_CONTRAST = '#f1f5fc';
export const DANGER_COLOR = '#da4453';
export const DANGER_COLOR_CONTRAST = '#f1f5fc';
export const SUCCESS_COLOR = '#8cc152';
export const SUCCESS_COLOR_CONTRAST  = '#f1f5fc';
export const WARNING_COLOR = '#f6bb42';
export const WARNING_COLOR_CONTRAST  = '#9d7626';

export const MUTED_COLOR = '#777777';
export const MUTED_COLOR_CONTRAST = '#FFFFFF';

export const BORDER_COLOR = '#e0e0e0';

// styles
export const DANGER_STYLE = {color: DANGER_COLOR_CONTRAST, backgroundColor: DANGER_COLOR};
export const WARNING_STYLE = {color: WARNING_COLOR_CONTRAST, backgroundColor: WARNING_COLOR};
export const SUCCESS_STYLE = {color: SUCCESS_COLOR_CONTRAST, backgroundColor: SUCCESS_COLOR};
